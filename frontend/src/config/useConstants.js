// Tier 1 closed enums, fetched once from /api/constants.
//
// These lists used to live in fieldOptions.js and weekdays.js, which meant two
// copies of every status list - one in Python that the business logic branched
// on, one in JS that the dropdowns rendered. Python is now the source; the
// fallback below is what renders during the first paint, not a second source
// of truth.

import { useEffect, useState } from "react";

import * as FALLBACK from "./fieldOptions";
import { applyConstants } from "./fieldOptions";

let cache = null;

export function useConstants() {
  const [constants, setConstants] = useState(cache);

  useEffect(() => {
    if (cache) return;
    fetch("/api/constants")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          cache = data;
          // Overwrite the bundled fieldOptions.js arrays in place so every
          // Add/Modify tab that maps over e.g. AIRING_STATUSES (whether or
          // not it calls this hook itself) renders API-sourced values on
          // its next render, not just callers of useConstants().
          applyConstants(data);
          setConstants(data);
        }
      })
      .catch(() => {
        /* fall back to the bundled copy */
      });
  }, []);

  return constants ?? FALLBACK.CONSTANTS_FALLBACK;
}
