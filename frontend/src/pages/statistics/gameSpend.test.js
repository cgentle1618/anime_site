import { describe, it, expect } from "vitest";
import computeGameSpend, { NO_CURRENCY, formatMoney } from "./gameSpend";

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
