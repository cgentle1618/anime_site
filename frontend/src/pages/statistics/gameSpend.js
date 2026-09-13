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

// A copy with no storefront, or no acquisition date, still cost money. It
// goes in a named bucket rather than being dropped, so the breakdown's rows
// always add up to the total above them - a breakdown that quietly omits
// rows is worse than one with an ugly bucket in it.
export const UNKNOWN_KEY = "Unrecorded";

/**
 * Group the priced copies by something on the copy row.
 *
 * `keyOf` reads one copy and returns its bucket; anything falsy lands in
 * UNKNOWN_KEY. Each bucket carries the same shape a column does - per
 * currency actuals AND converted USD/TWD - because the question "what did
 * this actually cost me" and "what is that worth in one currency" are both
 * worth answering at every level, not only at the top.
 */
export function groupSpend(games, fxRates, keyOf) {
  const fx = fxRates && fxRates.base ? fxRates : null;
  const buckets = {};
  pricedCopies(games).forEach((row) => {
    const key = keyOf(row.copy) || UNKNOWN_KEY;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(row);
  });
  return Object.entries(buckets).map(([key, rows]) => column(key, key, rows, fx));
}

// Biggest first, with the unrecorded bucket pinned last however big it is.
// Ranked on converted USD where rates allow it and on copy count where they
// do not: adding JPY to USD to decide an ORDER is the same mistake as adding
// them to decide a total, and a count is at least a fact.
const byMagnitude = (a, b) => {
  if ((a.key === UNKNOWN_KEY) !== (b.key === UNKNOWN_KEY)) {
    return a.key === UNKNOWN_KEY ? 1 : -1;
  }
  const cents = (c) => c.converted.find((x) => x.code === "USD")?.cents ?? null;
  const [ac, bc] = [cents(a), cents(b)];
  if (ac !== null && bc !== null) return bc - ac;
  return b.copies - a.copies;
};

/**
 * Spend per calendar year, newest first.
 *
 * `acquired_date` is a partial ISO string - "2024", "2024-06" or "2024-06-11"
 * - and a CHECK constraint guarantees one of those three shapes, so the year
 * is the first four characters and needs no date parsing. A copy with no date
 * lands in the unrecorded bucket, which is pinned last rather than sorted
 * into the middle of the years.
 */
export function spendByYear(games, fxRates) {
  return groupSpend(games, fxRates, (copy) =>
    copy.acquired_date ? String(copy.acquired_date).slice(0, 4) : null,
  ).sort((a, b) => {
    if ((a.key === UNKNOWN_KEY) !== (b.key === UNKNOWN_KEY)) {
      return a.key === UNKNOWN_KEY ? 1 : -1;
    }
    return b.key.localeCompare(a.key);
  });
}

/** Spend per storefront, biggest first. */
export function spendByStorefront(games, fxRates) {
  return groupSpend(games, fxRates, (copy) => copy.storefront).sort(byMagnitude);
}

/**
 * What an hour of play cost.
 *
 * Converted only, and absent entirely without rates: ranking titles by value
 * means comparing them to each other, and a TWD purchase and a USD one cannot
 * be ranked without a rate. Per-currency-per-hour would be several lists that
 * answer a question nobody asked.
 *
 * A title counts only when it has BOTH logged hours and a convertible price.
 * Two counts come back rather than one, because there are two ways to be
 * left out and they mean different things. `excluded` is priced titles with
 * no logged hours - `hours_played` is populated automatically only for Steam
 * titles, so a value figure computed over a third of a library should say so
 * rather than imply it covers everything. `unconvertible` is priced titles
 * whose currency has no rate; they are skipped rather than converted to zero,
 * which would have counted them as free and dragged the average down.
 */
export function costPerHour(games, fxRates) {
  const fx = fxRates && fxRates.base ? fxRates : null;
  if (!fx) return null;

  const titles = [];
  let noHours = 0;
  let unconvertible = 0;
  let totalCents = { USD: 0, TWD: 0 };
  let totalHours = 0;

  (games || []).forEach((game) => {
    const rows = pricedCopies([game]);
    if (rows.length === 0) return;

    const currencies = subtotal(rows);
    // At least one of THIS title's currencies must have a rate. Without this
    // check a title priced only in an unrated currency converts to zero and
    // is counted as free: its hours land in the denominator while nothing
    // lands in the numerator, so it silently drags the overall figure down.
    // Skipped and counted, not dropped quietly.
    if (!currencies.some((c) => fx.rates[c.code])) {
      unconvertible += 1;
      return;
    }

    const perTarget = {};
    TARGETS.forEach((target) => {
      const converted = convertSubtotal(currencies, fx, target);
      if (converted) perTarget[target] = converted;
    });
    // No rate for either target currency, so there is nothing to express it in.
    if (!perTarget.USD && !perTarget.TWD) return;

    const hours = Number(game.hours_played);
    if (!Number.isFinite(hours) || hours <= 0) {
      noHours += 1;
      return;
    }

    TARGETS.forEach((target) => {
      if (perTarget[target]) totalCents[target] += perTarget[target].cents;
    });
    totalHours += hours;

    titles.push({
      id: game.system_id,
      name: gameName(game),
      hours,
      perHour: Object.fromEntries(
        TARGETS.filter((t) => perTarget[t]).map((t) => [
          t,
          Math.round(perTarget[t].cents / hours),
        ]),
      ),
    });
  });

  if (titles.length === 0) return null;

  const ranked = [...titles].sort(
    (a, b) => (a.perHour.USD ?? a.perHour.TWD) - (b.perHour.USD ?? b.perHour.TWD),
  );
  return {
    overall: Object.fromEntries(
      TARGETS.filter((t) => totalCents[t] > 0).map((t) => [
        t,
        Math.round(totalCents[t] / totalHours),
      ]),
    ),
    hours: totalHours,
    titles: titles.length,
    best: ranked.slice(0, 3),
    worst: ranked.slice(-3).reverse(),
    excluded: noHours,
    unconvertible,
    asOf: fx.asOf || fx.as_of || null,
  };
}

// The nine media types do not share a name column - a game's is game_name_en,
// and the shape that reads as uniform is exactly the one that is not. Falls
// back through the other recorded names before giving up, so a title recorded
// only in Chinese is still nameable in the value list.
function gameName(game) {
  return (
    game.game_name_en ||
    game.game_name_roman ||
    game.game_name_cn ||
    game.game_name_jp ||
    "Untitled"
  );
}
