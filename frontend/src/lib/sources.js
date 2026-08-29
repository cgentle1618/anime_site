// Fetches the suggestion lists every "tags" field on the Add/Modify/Defaults
// pages draws from: /api/options (all categories, fetched once and filtered
// client-side — the response carries category+scopes), /api/studio (one flat
// list — studios have no role/scope concept), and /api/person, fetched once
// per distinct {role, scope} pair used across fieldMeta.js's source
// descriptors (PersonResponse does not carry role/scope, so the server does
// the filtering, not the client).
import { endpoints } from "../api/endpoints";
import { PERSON_SOURCES } from "../config/formFields/fieldMeta";

function personKey(role, scope) {
  return `${role}|${scope || ""}`;
}

async function readJsonArray(res) {
  if (!res || !res.ok) return [];
  try {
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Fetches { options, studios, people } — the "sources" bag getSourceValues() reads. */
export async function fetchAllSources() {
  const [optionsRes, studiosRes, ...peopleRes] = await Promise.all([
    fetch(endpoints.options.list(), { credentials: "include" }),
    fetch(endpoints.studio.list(), { credentials: "include" }),
    ...PERSON_SOURCES.map((s) => {
      const qs = new URLSearchParams();
      qs.set("role", s.role);
      if (s.scope) qs.set("scope", s.scope);
      return fetch(endpoints.person.list(qs.toString()), {
        credentials: "include",
      });
    }),
  ]);

  const options = await readJsonArray(optionsRes);
  const studios = await readJsonArray(studiosRes);
  const people = {};
  for (let i = 0; i < PERSON_SOURCES.length; i++) {
    const s = PERSON_SOURCES[i];
    people[personKey(s.role, s.scope)] = await readJsonArray(peopleRes[i]);
  }

  return { options, studios, people };
}

export { personKey };
