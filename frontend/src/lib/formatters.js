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
    const key = `${source.role}|${source.scope || ""}`;
    return (sources.people?.[key] || []).map((p) => p.name_native);
  }
  if (source.kind === "studio") {
    return (sources.studios || []).map((s) => s.name_native);
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
 * Returns a human-readable progress string for a novel entry, branching
 * on the novel's progress_display field.
 */
export function getNovelProgress(novel) {
  switch (novel.progress_display) {
    case "vol_tw":
      return `${novel.vol_fin ?? 0} / ${novel.vol_total_tw ?? "?"} VOL TW`;
    case "vol_original":
      return `${novel.vol_fin ?? 0} / ${novel.vol_total_original ?? "?"} VOL`;
    case "arc_ch":
      return `${novel.arc_fin ?? 0}/${novel.arc_total ?? "?"} ARC  ${novel.ch_fin ?? 0}/${novel.ch_total ?? "?"} CH`;
    default:
      return `${novel.ch_fin ?? 0} / ${novel.ch_total ?? "?"} CH`;
  }
}
