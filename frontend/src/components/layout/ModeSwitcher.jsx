// Frontend: change which entries and fields this session can reach.
//
// An access mode is a ceiling on OBJECTS, chosen per session. Narrowing is
// instant; widening asks for the password again, so a browser left logged in
// at a narrow mode is actually narrow.
//
// Three rules this control does not get to decide, all settled server-side:
//
//   1. NO PERMISSION GATE. Every signed-in account holds at least one mode,
//      and gating this would hide it from the `user` role - the account that
//      most needs to narrow itself. It reads neither of the SPA's two
//      permission surfaces, on purpose.
//
//   2. `requires_password` COMES FROM THE SERVER. /api/auth/me computes the
//      subset test per mode and the switch endpoint enforces it with the same
//      function. Recomputing it here would be a second implementation of one
//      rule, and the one in the browser would be the one nobody tested.
//
//   3. It renders only when more than one mode is held. A control with one
//      option is noise.
import { useState } from "react";
import { useLocation } from "react-router-dom";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { hardNavigate } from "../../lib/hardNavigate";

export default function ModeSwitcher() {
  const { mode, modes } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const [pending, setPending] = useState(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // More than one, not "at least one": switching to where you already are is
  // not a choice, and a select with a single option is noise.
  if (!modes || modes.length < 2) return null;

  async function apply(target, withPassword) {
    setBusy(true);
    try {
      await fetchJson(endpoints.auth.accessMode(), {
        method: "POST",
        ...jsonBody(
          withPassword
            ? { mode_id: target.id, password: withPassword }
            : { mode_id: target.id },
        ),
      });
      setPending(null);
      setPassword("");
      // What this viewer may SEE has just changed, so every answer already
      // on screen was computed under the old ceiling: narrowing leaves rows
      // visible that the new mode hides, widening leaves them missing. A
      // full page load is the only thing that reaches all of it - the query
      // cache, and the component state the cache does not own. It also
      // discards the success toast, which is why there is not one.
      hardNavigate(location.pathname + location.search);
    } catch (err) {
      showToast("error", err.message || "Could not change access mode.");
    } finally {
      setBusy(false);
    }
  }

  function choose(id) {
    const target = modes.find((m) => m.id === id);
    if (!target || target.is_active) return;
    // The SERVER decided whether this needs a password. Do not second-guess
    // it here by comparing the modes' contents.
    if (target.requires_password) setPending(target);
    else apply(target, null);
  }

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="access-mode">
        Access mode
      </label>
      <select
        id="access-mode"
        value={mode?.id ?? ""}
        disabled={busy}
        onChange={(e) => choose(e.target.value)}
        className="border border-border bg-surface text-text text-xs rounded px-2 py-1"
        title="What this session can see"
      >
        {modes.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
            {m.requires_password ? " 🔒" : ""}
          </option>
        ))}
      </select>

      {pending && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply(pending, password);
          }}
          className="flex items-center gap-1"
        >
          <input
            autoFocus
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`Password to widen to ${pending.label}`}
            className="border border-border bg-surface text-text text-xs rounded px-2 py-1"
          />
          <button type="submit" disabled={busy} className="text-brand text-xs">
            Confirm
          </button>
          <button
            type="button"
            onClick={() => {
              setPending(null);
              setPassword("");
            }}
            className="text-text-faint text-xs"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
