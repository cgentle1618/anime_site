// Frontend: run the single-entry Replace pipeline after a save and hand back
// the enriched row.
//
// Add/Modify used to fire the POST and ignore the response, then toast
// "enriched successfully" and show the pre-enrichment row until a reload.
import { endpoints } from "../api/endpoints";

/**
 * POSTs /api/data-control/replace/<type>/<id> and re-reads the entry.
 * Resolves to the fresh entry, or null when enrichment (or the re-read)
 * failed so the caller can keep what it already has and warn.
 */
export async function enrichEntry(type, id) {
  try {
    const res = await fetch(`/api/data-control/replace/${type}/${id}`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const fresh = await fetch(endpoints.resource(type).detail(id), {
      credentials: "include",
    });
    return fresh.ok ? await fresh.json() : null;
  } catch {
    return null;
  }
}
