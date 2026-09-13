// Frontend: admin page file for FxRatesEditor.
import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../../api/endpoints";
import { PRICE_CURRENCIES } from "../../config/fieldOptions";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The hand-maintained exchange rates the statistics spend block converts with.
 *
 * A card rather than more state inside Admin.jsx: this owns a form, a fetch
 * and a save, and Admin.jsx is long enough that another three useStates in it
 * would be the expensive way to add one editable config row.
 *
 * The rates are typed, not fetched. `as_of` is therefore not decoration - it
 * is the only thing telling a reader how old the converted totals are, so it
 * is saved with the numbers and defaults to today whenever they are edited.
 */
export default function FxRatesEditor({ showToast }) {
  const [base, setBase] = useState("USD");
  const [asOf, setAsOf] = useState(today);
  const [rates, setRates] = useState({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoints.fxRates.get(), {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.base) setBase(data.base);
        if (data.as_of) setAsOf(data.as_of);
        setRates(
          Object.fromEntries(
            Object.entries(data.rates || {}).map(([k, v]) => [k, String(v)]),
          ),
        );
      }
    } catch {
      /* an unreachable rate table is not worth a toast on page load */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The base converts to itself, so there is nothing to type for it and a box
  // that only ever holds 1 invites someone to change it to something else.
  const editable = PRICE_CURRENCIES.filter((code) => code !== base);

  async function handleSave() {
    const payload = {};
    for (const code of editable) {
      const raw = (rates[code] ?? "").trim();
      if (!raw) continue;
      const value = Number.parseFloat(raw);
      if (!Number.isFinite(value) || value <= 0) {
        showToast("warning", `${code} needs a rate greater than zero.`);
        return;
      }
      payload[code] = value;
    }
    if (Object.keys(payload).length === 0) {
      showToast("warning", "Enter at least one rate.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(endpoints.fxRates.update(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base, as_of: asOf, rates: payload }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save exchange rates");
      showToast("success", "Exchange rates updated.");
      await load();
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
      <h2 className="text-lg font-black text-text uppercase tracking-widest mb-4 flex items-center border-b border-border pb-2">
        Exchange Rates
      </h2>
      <p className="text-xs text-text-muted mb-4">
        Used to convert game spend on the Statistics page. Rates are how many
        units of each currency one {base} buys. Leave a currency blank to omit
        it — spend recorded in it is then left out of the converted totals
        rather than guessed at.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">
            Base
          </span>
          <select
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className="w-full bg-surface-2 border border-border-strong rounded-lg text-sm font-bold focus:ring-brand focus:border-brand py-2"
          >
            {PRICE_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">
            As of
          </span>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="w-full bg-surface-2 border border-border-strong rounded-lg text-sm font-mono focus:ring-brand focus:border-brand py-2 px-3"
          />
        </label>

        {editable.map((code) => (
          <label key={code} className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">
              {code} per {base}
            </span>
            <input
              type="number"
              step="any"
              min="0"
              value={rates[code] ?? ""}
              onChange={(e) =>
                setRates((prev) => ({ ...prev, [code]: e.target.value }))
              }
              placeholder="—"
              className="w-full bg-surface-2 border border-border-strong rounded-lg text-sm font-mono focus:ring-brand focus:border-brand py-2 px-3"
            />
          </label>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !loaded}
        className="bg-brand hover:bg-brand-hover text-on-brand rounded-lg py-2.5 px-6 text-sm font-bold transition shadow-sm disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save Rates"}
      </button>
    </div>
  );
}
