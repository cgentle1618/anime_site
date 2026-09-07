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

// Mirror of NOVEL_VOLUME_ONLY_TYPES in app/utils/constants.py, derived the
// same way: a type that may only hold volume rows counts volumes and nothing
// else. Its chapter and arc columns are not empty, they are meaningless, so
// derive_novel_progress() clears them server-side and nothing renders or
// edits them here.
export const NOVEL_VOLUME_ONLY_TYPES = Object.entries(NOVEL_UNIT_KINDS_BY_TYPE)
  .filter(([, kinds]) => kinds.length === 1 && kinds[0] === "volume")
  .map(([type]) => type);

/**
 * Whether this novel counts chapters (and, for Web, arcs) at all.
 *
 * An unrecognised or unset type counts them, matching the server: only the
 * two named volume-only types are cleared, so anything else keeps its pair.
 */
export function countsChapters(novel) {
  return !NOVEL_VOLUME_ONLY_TYPES.includes(novel?.type);
}

/**
 * Whether this novel shows a volume counter.
 *
 * Only Web says no. A web novel is read in chapters, and a volume number on
 * one is at best the print run it later got — so the columns are kept (a
 * type change brings them straight back) but nothing renders or edits them.
 * That asymmetry with countsChapters() is deliberate: chapters on a light
 * novel are meaningless and get cleared server-side, volumes on a web novel
 * are merely not the counter in use.
 */
export function countsVolumes(novel) {
  return novel?.type !== "Web";
}

function hasArcRows(novel) {
  return (novel?.units || []).some((u) => u.unit_kind === "arc");
}

const PROGRESS_DISPLAY_LABEL = {
  vol_original: "VOL JP/KR (Original Volumes)",
  vol_tw: "VOL TW (Taiwan Volumes)",
  ch: "CH (Chapters)",
  arc: "ARC (Arcs)",
  arc_ch: "ARC + CH (Arc and chapter)",
};

/**
 * The progress_display values this novel may be set to, as {value, label}.
 *
 * Built from what the entry actually has rather than from a flat list: a
 * volume counter only where volumes are counted, a chapter counter only
 * where chapters are, and the two arc counters only once arc rows exist —
 * picking "arc" on a novel with no arcs could render nothing but "?".
 *
 * The blank first option is the stored NULL, labelled with whatever
 * effectiveProgressDisplay() derives for this entry, so the admin can see
 * what "default" currently means before overriding it.
 */
export function progressDisplayOptions(novel) {
  const values = [];
  if (countsVolumes(novel)) values.push("vol_original", "vol_tw");
  if (countsChapters(novel)) values.push("ch");
  if (countsChapters(novel) && hasArcRows(novel)) values.push("arc", "arc_ch");

  const derived = PROGRESS_DISPLAY_LABEL[derivedProgressDisplay(novel)] || "";
  return [
    { value: "", label: `— Default (${derived}) —` },
    ...values.map((value) => ({ value, label: PROGRESS_DISPLAY_LABEL[value] })),
  ];
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
function derivedProgressDisplay(novel) {
  const units = novel?.units || [];
  const type = novel?.type;

  if (type === "Web") {
    return hasArcRows(novel) ? "arc_ch" : "ch";
  }
  if (type === "Other") {
    return units.some((u) => u.unit_kind === "story" || u.unit_kind === "chapter")
      ? "ch"
      : "vol_original";
  }
  // Light Novel, Novel, and any unrecognised type default to volumes.
  return "vol_original";
}

export function effectiveProgressDisplay(novel) {
  const pd = novel?.progress_display;
  // The override only wins if the type still supports it. Pull and Fill write
  // this column, and a type change leaves an old value behind, so a Web novel
  // can hold "vol_tw" — honouring it would render a volume row the type does
  // not have. An unsupported value falls back to the derived mode; the select
  // still shows it (withLegacyProgressDisplay) so it is visible, not silently
  // swapped.
  if (pd && progressDisplayOptions(novel).some((o) => o.value === pd)) return pd;

  return derivedProgressDisplay(novel);
}

/**
 * One whole-arc step for the "arc" display: finish (or unfinish) an entire
 * arc and reset the in-arc cursor, so ch_fin stays exactly the sum of the
 * finished arcs. Clamped at both ends — unlike arcStep, which deliberately
 * runs past the last recorded arc for an ongoing novel, a whole-arc step has
 * no arc to move into.
 */
export function wholeArcStep(arcs, arcFin, chInArc, direction) {
  const total = (arcs || []).length;
  const fin = Math.max(0, Math.floor(Number(arcFin) || 0));
  const next = Math.min(total, Math.max(0, fin + direction));
  return { arc_fin: next, ch_fin_in_arc: 0 };
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
