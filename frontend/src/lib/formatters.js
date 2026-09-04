// Misc display/data helpers: length, release, progress, ratings, options, type parsing.
import { formatReleaseDate } from "./releaseDate";

export function isBaha(anime) {
  return (
    anime.source_baha === true ||
    String(anime.source_baha).toLowerCase() === "true"
  );
}

export function getReleaseFallback(entry) {
  const date = entry.release_date;
  if (entry.release_season && date)
    return `${entry.release_season} ${String(date).slice(0, 4)}`;
  if (date) return formatReleaseDate(date);
  return "TBA";
}

const RATING_WEIGHT = { S: 0, "A+": 1, A: 2, B: 3, C: 4, D: 5, E: 6, F: 7 };
export function getRatingWeight(rating) {
  return RATING_WEIGHT[rating] !== undefined ? RATING_WEIGHT[rating] : 99;
}

/**
 * Suggestion list for one "tags" field, given its `source` descriptor from
 * fieldMeta.js and the page's fetched `sources` bag ({ options, people,
 * studios } — see lib/sources.js).
 *
 * `kind` selects where the values come from:
 *   option -> sources.options, filtered by category (+ scope, when scoped)
 *   person -> sources.people[`${role}|${scope||""}`] — already server-filtered
 *   studio -> sources.studios, unfiltered (studios have no role/scope concept)
 */
export function getSourceValues(sources, source) {
  if (!source || !sources) return [];
  if (source.kind === "option") {
    return (sources.options || [])
      .filter(
        (o) =>
          o.category === source.category &&
          (!source.scope ||
            !o.scopes ||
            o.scopes.length === 0 ||
            o.scopes.includes(source.scope)),
      )
      .map((o) => o.value);
  }
  if (source.kind === "person") {
    // display_name is computed server-side (PersonResponse) over four name
    // columns and a per-row choice - do not re-derive it here. Empty values
    // are dropped for the same reason as studios: they would collide with a
    // typed value in the Set-based "already exists" check.
    const key = `${source.role}|${source.scope || ""}`;
    return (sources.people?.[key] || [])
      .map((p) => p.display_name)
      .filter((name) => !!name);
  }
  if (source.kind === "studio") {
    // display_name is computed server-side (StudioResponse) - do not
    // re-derive it here, that would be a second source of truth. Filter out
    // empty values so a nameless studio can't collide with a typed value in
    // the Set-based "already exists" check in ensureSourceValues.js.
    return (sources.studios || [])
      .map((s) => s.display_name)
      .filter((name) => !!name);
  }
  return [];
}

export function formatLength(minutes) {
  if (!minutes) return null;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}min`;
  if (mins === 0) return `${hrs}hr`;
  return `${hrs}hr ${mins}min`;
}

export function parseTypes(franchiseType) {
  if (!franchiseType) return [];
  return franchiseType
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Human-readable progress for a novel, branching on progress_display.
 *
 * The arc_ch case is two-stage: the arc being read is arc_fin + 1, and
 * ch_fin_in_arc counts chapters inside it, so the denominator is that arc's
 * own ch_count rather than the whole novel's chapter total.
 */
export function getNovelProgress(novel) {
  switch (novel.progress_display) {
    case "vol_tw":
      return `${novel.vol_fin ?? 0} / ${novel.vol_total_tw ?? "?"} VOL TW`;
    case "vol_original":
      return `${novel.vol_fin ?? 0} / ${novel.vol_total_original ?? "?"} VOL JP/KR`;
    case "arc_ch": {
      const arcs = (novel.units || [])
        .filter((u) => u.unit_kind === "arc")
        .sort((a, b) => a.position - b.position);
      const finished = novel.arc_fin ?? 0;
      const current = arcs[finished];
      if (!current) {
        return `${novel.ch_fin ?? 0} / ${novel.ch_total ?? "?"} CH`;
      }
      return `arc ${finished + 1} · ${novel.ch_fin_in_arc ?? 0}/${
        current.ch_count ?? "?"
      } CH`;
    }
    default:
      return `${novel.ch_fin ?? 0} / ${novel.ch_total ?? "?"} CH`;
  }
}
