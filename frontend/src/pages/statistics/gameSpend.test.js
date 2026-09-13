import { describe, it, expect } from "vitest";
import computeGameSpend, {
  NO_CURRENCY,
  UNKNOWN_KEY,
  costPerHour,
  formatMoney,
  spendByStorefront,
  spendByYear,
} from "./gameSpend";

const game = (...copies) => ({ system_id: "g", copies });
const FX = { base: "USD", as_of: "2026-09-13", rates: { USD: 1, TWD: 32, JPY: 150 } };

const owned = (spend) => spend.columns.find((c) => c.key === "owned");
const bought = (spend) => spend.columns.find((c) => c.key === "bought");
const rate = (column, code) =>
  column.currencies.find((c) => c.code === code) || null;
const converted = (column, code) =>
  column.converted.find((c) => c.code === code) || null;

describe("computeGameSpend", () => {
  it("totals each currency separately rather than adding them together", () => {
    const spend = computeGameSpend(
      [
        game(
          { price_paid: "9.99", price_currency: "USD" },
          { price_paid: "590", price_currency: "TWD" },
        ),
        game({ price_paid: "20.01", price_currency: "USD" }),
      ],
      FX,
    );

    expect(rate(owned(spend), "USD").cents).toBe(3000);
    expect(rate(owned(spend), "TWD").cents).toBe(59000);
    expect(owned(spend).copies).toBe(3);
  });

  it("leaves out a copy with no price at all", () => {
    // A gifted or free copy is not a zero, it is an absence - counting it
    // would drag the copy count up without moving the total.
    const spend = computeGameSpend(
      [game({ price_currency: "USD", acquisition: "Gifted" }, { price_paid: "5.00", price_currency: "USD" })],
      FX,
    );
    expect(owned(spend).copies).toBe(1);
    expect(rate(owned(spend), "USD").cents).toBe(500);
  });

  it("counts a priced copy that has no currency, in its own bucket", () => {
    const spend = computeGameSpend([game({ price_paid: "12.00" })], FX);
    expect(rate(owned(spend), NO_CURRENCY).cents).toBe(1200);
  });

  it("narrows the bought column to purchases", () => {
    const spend = computeGameSpend(
      [
        game(
          { price_paid: "10.00", price_currency: "USD", acquisition: "Bought" },
          { price_paid: "4.00", price_currency: "USD", acquisition: "Bundled" },
        ),
      ],
      FX,
    );
    expect(rate(owned(spend), "USD").cents).toBe(1400);
    expect(rate(bought(spend), "USD").cents).toBe(1000);
  });

  it("converts every currency into both USD and TWD", () => {
    // 320 TWD is 10 USD at 32, so owned is 20 USD / 640 TWD.
    const spend = computeGameSpend(
      [
        game(
          { price_paid: "10.00", price_currency: "USD" },
          { price_paid: "320", price_currency: "TWD" },
        ),
      ],
      FX,
    );
    expect(converted(owned(spend), "USD").cents).toBe(2000);
    expect(converted(owned(spend), "TWD").cents).toBe(64000);
  });

  it("prints no converted total at all when no rates are configured", () => {
    // The failure this guards: a number built from a rate nobody entered
    // looks exactly like a real one.
    const spend = computeGameSpend(
      [game({ price_paid: "10.00", price_currency: "USD" })],
      null,
    );
    expect(owned(spend).converted).toEqual([]);
    expect(spend.asOf).toBeNull();
  });

  it("flags a converted total that had to skip a currency", () => {
    const spend = computeGameSpend(
      [
        game(
          { price_paid: "10.00", price_currency: "USD" },
          { price_paid: "40.00", price_currency: "EUR" },
          { price_paid: "7.00" },
        ),
      ],
      FX,
    );
    const usd = converted(owned(spend), "USD");
    // The EUR and uncurrencied copies are excluded, not guessed at...
    expect(usd.cents).toBe(1000);
    // ...and the column says so, so the figure is not read as complete.
    expect(usd.missing).toContain("EUR");
    expect(usd.missing).toContain(NO_CURRENCY);
  });

  it("drops a target currency that has no rate instead of showing zero", () => {
    const spend = computeGameSpend(
      [game({ price_paid: "10.00", price_currency: "USD" })],
      { base: "USD", as_of: "2026-09-13", rates: { USD: 1 } },
    );
    expect(converted(owned(spend), "USD").cents).toBe(1000);
    expect(converted(owned(spend), "TWD")).toBeNull();
  });

  it("reports an empty collection so the block can hide itself", () => {
    expect(computeGameSpend([], FX).isEmpty).toBe(true);
    expect(computeGameSpend([game({ price_currency: "USD" })], FX).isEmpty).toBe(true);
    expect(
      computeGameSpend([game({ price_paid: "1.00", price_currency: "USD" })], FX).isEmpty,
    ).toBe(false);
  });

  it("sorts by spend, with the uncurrencied bucket last", () => {
    const spend = computeGameSpend(
      [
        game(
          { price_paid: "1.00", price_currency: "USD" },
          { price_paid: "500.00" },
          { price_paid: "50.00", price_currency: "TWD" },
        ),
      ],
      FX,
    );
    expect(owned(spend).currencies.map((c) => c.code)).toEqual([
      "TWD",
      "USD",
      NO_CURRENCY,
    ]);
  });

  it("keeps cents exact across many copies", () => {
    // Summed in float, 0.1 + 0.2 repeated drifts into the printed digits.
    const copies = Array.from({ length: 300 }, () => ({
      price_paid: "0.10",
      price_currency: "USD",
    }));
    const spend = computeGameSpend([game(...copies)], FX);
    expect(rate(owned(spend), "USD").cents).toBe(3000);
  });

  it("normalises a lowercase or padded currency code", () => {
    const spend = computeGameSpend(
      [game({ price_paid: "5.00", price_currency: " usd " }, { price_paid: "5.00", price_currency: "USD" })],
      FX,
    );
    expect(owned(spend).currencies).toHaveLength(1);
    expect(rate(owned(spend), "USD").cents).toBe(1000);
  });
});

describe("formatMoney", () => {
  it("always shows two decimal places so a column lines up", () => {
    expect(formatMoney("USD", 1000)).toBe("USD 10.00");
  });

  it("prints a bare amount for the uncurrencied bucket", () => {
    expect(formatMoney(NO_CURRENCY, 1250)).toBe("12.50");
  });
});

describe("spendByYear", () => {
  const g = (...copies) => ({ system_id: "g", copies });

  it("takes the year from a partial ISO date in any of its three shapes", () => {
    // The CHECK constraint admits YYYY, YYYY-MM and YYYY-MM-DD, so the year
    // is a prefix and never needs parsing.
    const rows = spendByYear(
      [
        g(
          { price_paid: "10.00", price_currency: "USD", acquired_date: "2024" },
          { price_paid: "10.00", price_currency: "USD", acquired_date: "2024-06" },
          { price_paid: "5.00", price_currency: "USD", acquired_date: "2024-06-11" },
        ),
      ],
      FX,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("2024");
    expect(rate(rows[0], "USD").cents).toBe(2500);
  });

  it("orders years newest first and pins the undated bucket last", () => {
    const rows = spendByYear(
      [
        g(
          { price_paid: "1.00", price_currency: "USD", acquired_date: "2022" },
          { price_paid: "1.00", price_currency: "USD" },
          { price_paid: "1.00", price_currency: "USD", acquired_date: "2025" },
          { price_paid: "1.00", price_currency: "USD", acquired_date: "2023" },
        ),
      ],
      FX,
    );
    expect(rows.map((r) => r.key)).toEqual(["2025", "2023", "2022", UNKNOWN_KEY]);
  });

  it("counts an undated copy rather than dropping it", () => {
    // A breakdown whose rows do not add up to the total above it is worse
    // than one with an ugly bucket in it.
    const rows = spendByYear([g({ price_paid: "7.00", price_currency: "USD" })], FX);
    expect(rate(rows[0], "USD").cents).toBe(700);
  });

  it("still converts inside each year", () => {
    const rows = spendByYear(
      [g({ price_paid: "320", price_currency: "TWD", acquired_date: "2024-01" })],
      FX,
    );
    expect(converted(rows[0], "USD").cents).toBe(1000);
    expect(converted(rows[0], "TWD").cents).toBe(32000);
  });
});

describe("spendByStorefront", () => {
  const g = (...copies) => ({ system_id: "g", copies });

  it("groups by storefront, biggest first", () => {
    const rows = spendByStorefront(
      [
        g(
          { price_paid: "5.00", price_currency: "USD", storefront: "GOG" },
          { price_paid: "50.00", price_currency: "USD", storefront: "Steam" },
          { price_paid: "20.00", price_currency: "USD", storefront: "Switch" },
        ),
      ],
      FX,
    );
    expect(rows.map((r) => r.key)).toEqual(["Steam", "Switch", "GOG"]);
  });

  it("pins the unrecorded bucket last even when it is the biggest", () => {
    const rows = spendByStorefront(
      [
        g(
          { price_paid: "500.00", price_currency: "USD" },
          { price_paid: "5.00", price_currency: "USD", storefront: "Steam" },
        ),
      ],
      FX,
    );
    expect(rows.map((r) => r.key)).toEqual(["Steam", UNKNOWN_KEY]);
  });

  it("falls back to copy count for ordering when no rates are set", () => {
    // Ranking on an unconverted sum would mean adding JPY to USD to decide an
    // order, which is the same mistake as adding them to decide a total.
    const rows = spendByStorefront(
      [
        g(
          { price_paid: "1.00", price_currency: "USD", storefront: "Steam" },
          { price_paid: "1.00", price_currency: "USD", storefront: "Steam" },
          { price_paid: "900.00", price_currency: "JPY", storefront: "DLsite" },
        ),
      ],
      null,
    );
    expect(rows.map((r) => r.key)).toEqual(["Steam", "DLsite"]);
  });
});

describe("costPerHour", () => {
  const g = (props, ...copies) => ({ system_id: "g", copies, ...props });

  it("divides converted spend by hours played", () => {
    // 20 USD over 40 hours is 0.50/hour, and 0.50 USD is 16 TWD at 32.
    const value = costPerHour(
      [g({ game_name_en: "A", hours_played: 40 }, { price_paid: "20.00", price_currency: "USD" })],
      FX,
    );
    expect(value.overall.USD).toBe(50);
    expect(value.overall.TWD).toBe(1600);
    expect(value.hours).toBe(40);
    expect(value.titles).toBe(1);
  });

  it("returns nothing at all when no rates are configured", () => {
    expect(
      costPerHour([g({ hours_played: 10 }, { price_paid: "10.00", price_currency: "USD" })], null),
    ).toBeNull();
  });

  it("excludes a priced title with no hours, and says how many", () => {
    const value = costPerHour(
      [
        g({ game_name_en: "Played", hours_played: 10 }, { price_paid: "10.00", price_currency: "USD" }),
        g({ game_name_en: "Unplayed" }, { price_paid: "60.00", price_currency: "USD" }),
        g({ game_name_en: "Zero", hours_played: 0 }, { price_paid: "60.00", price_currency: "USD" }),
      ],
      FX,
    );
    // The 60.00 titles must not reach the total, or the figure is a lie.
    expect(value.overall.USD).toBe(100);
    expect(value.excluded).toBe(2);
  });

  it("never divides by zero hours", () => {
    const value = costPerHour(
      [g({ hours_played: 0 }, { price_paid: "10.00", price_currency: "USD" })],
      FX,
    );
    expect(value).toBeNull();
  });

  it("ranks best and worst value by cost per hour", () => {
    const value = costPerHour(
      [
        g({ game_name_en: "Cheap", hours_played: 100 }, { price_paid: "10.00", price_currency: "USD" }),
        g({ game_name_en: "Dear", hours_played: 1 }, { price_paid: "60.00", price_currency: "USD" }),
        g({ game_name_en: "Middle", hours_played: 10 }, { price_paid: "20.00", price_currency: "USD" }),
      ],
      FX,
    );
    expect(value.best.map((t) => t.name)).toEqual(["Cheap", "Middle", "Dear"]);
    expect(value.worst[0].name).toBe("Dear");
    expect(value.best[0].perHour.USD).toBe(10);
  });

  it("skips a title whose currency has no rate rather than counting it as free", () => {
    const value = costPerHour(
      [
        g({ game_name_en: "Rated", hours_played: 10 }, { price_paid: "10.00", price_currency: "USD" }),
        g({ game_name_en: "Unrated", hours_played: 10 }, { price_paid: "999.00", price_currency: "KRW" }),
      ],
      FX,
    );
    expect(value.titles).toBe(1);
    expect(value.overall.USD).toBe(100);
  });

  it("names a title recorded only in Chinese", () => {
    const value = costPerHour(
      [g({ game_name_cn: "原神", hours_played: 5 }, { price_paid: "5.00", price_currency: "USD" })],
      FX,
    );
    expect(value.best[0].name).toBe("原神");
  });
});
