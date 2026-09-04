// Frontend mirror of app/services/domain/novel_units.py. The editor previews
// a generated key before anything is saved, so the fallback cannot live only
// on the server. src/config/novelUnitKinds.test.js pins the two together.

const KEY_PREFIX = {
  volume: "Vol",
  arc: "Arc",
  story: "Story",
  chapter: "Ch",
};

export const NOVEL_UNIT_KINDS_BY_TYPE = {
  "Light Novel": ["volume"],
  Novel: ["volume"],
  Web: ["arc"],
  Other: ["volume", "story", "chapter"],
};

export function unitDisplayKey(kind, position, unitKey) {
  if (unitKey && String(unitKey).trim()) return String(unitKey).trim();
  const prefix = KEY_PREFIX[kind] || "Unit";
  const pos = Number(position) || 0;
  return `${prefix} ${pos}`;
}

export function kindsForType(novelType) {
  return NOVEL_UNIT_KINDS_BY_TYPE[novelType] || ["volume"];
}

/**
 * Decision G: the type (plus, for Web, whether arc rows exist) determines
 * which progress pair a novel renders. `progress_display` narrows to a pure
 * override — when it is set, it wins outright and existing rows keep
 * rendering exactly as they did before this table existed (that is what
 * `withLegacyProgressDisplay` protects on the select side). When it is
 * unset, the mode is derived here so every consumer agrees:
 *
 * | novel.type                      | Effective mode        |
 * |----------------------------------|------------------------|
 * | Web, with arc rows                | "arc_ch" (two-stage)   |
 * | Web, no arc rows                  | "ch"                   |
 * | Light Novel / Novel                | "vol_original"          |
 * | Other, unit kind volume (or none)  | "vol_original"          |
 * | Other, unit kind story or chapter  | "ch"                   |
 *
 * Consumers: getNovelProgress (lib/formatters.js), MediaCard, and
 * NovelDashboardCard / NovelTrackerBlock all read this instead of the raw
 * `progress_display` column, so a web novel with arcs cannot show a volume
 * counter in one place and a two-stage row in another.
 */
export function effectiveProgressDisplay(novel) {
  const pd = novel?.progress_display;
  if (pd) return pd;

  const units = novel?.units || [];
  const type = novel?.type;

  if (type === "Web") {
    return units.some((u) => u.unit_kind === "arc") ? "arc_ch" : "ch";
  }
  if (type === "Other") {
    return units.some((u) => u.unit_kind === "story" || u.unit_kind === "chapter")
      ? "ch"
      : "vol_original";
  }
  // Light Novel, Novel, and any unrecognised type default to volumes.
  return "vol_original";
}

/**
 * One chapter step for a web novel with arcs, folded into the right arc.
 * Mirrors normalize_arc_progress: carrying stops at the last recorded arc,
 * because an ongoing novel is read into an arc nobody has entered yet.
 */
export function arcStep(arcs, arcFin, chInArc, direction) {
  const counts = (arcs || []).map((a) => Number(a.ch_count) || 0);
  let fin = Math.max(0, Math.floor(Number(arcFin) || 0));
  let ch = (Number(chInArc) || 0) + direction;

  while (ch < 0 && fin > 0) {
    fin -= 1;
    ch += counts[fin];
  }
  if (ch < 0) ch = 0;

  while (fin < counts.length) {
    const width = counts[fin];
    if (width <= 0 || ch < width) break;
    ch -= width;
    fin += 1;
  }

  return { arc_fin: fin, ch_fin_in_arc: ch };
}
