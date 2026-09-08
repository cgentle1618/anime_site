// Frontend: keeps the address bar showing the canonical /type/id/slug path.
//
// The slug is decorative and never read, so a stale one after a rename is
// harmless - but it should not stay in the bar. replaceState rather than
// navigate: this is a cosmetic correction, not a navigation, and it must not
// add a history entry the back button has to walk through.
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { entityPath } from "../lib/entityPath";

export function useCanonicalPath(type, entity) {
  const location = useLocation();
  const navigate = useNavigate();
  const canonical = entityPath(type, entity);

  useEffect(() => {
    if (!canonical) return;
    if (location.pathname === canonical) return;
    navigate(canonical + location.search + location.hash, { replace: true });
  }, [
    canonical,
    location.pathname,
    location.search,
    location.hash,
    navigate,
  ]);
}
