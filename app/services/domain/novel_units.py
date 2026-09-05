"""
Novel unit arithmetic — rollover, derivation, and the display-key fallback.

Pure functions: no session, no queries. They are called from the router
(every write path) and from run_sync_novel (Calculate), so they must be
idempotent — running them twice on the same entry changes nothing.
"""

from app.utils.constants import NOVEL_UNIT_KEY_PREFIX, NOVEL_VOLUME_ONLY_TYPES


def _num(val) -> float:
    return float(val or 0)


def normalize_arc_progress(arc_counts, arc_fin, ch_fin_in_arc):
    """
    Fold an out-of-range chapter cursor into the right arc.

    arc_counts is every arc's ch_count in position order. arc_fin counts arcs
    that are *fully* finished, so the arc being read is at index arc_fin.

    Carrying up stops at the last recorded arc: an ongoing web novel is read
    into an arc nobody has entered yet, and clamping would discard that.
    An arc with an unknown (zero or null) count also stops the carry, because
    there is no width to subtract.
    """
    counts = [_num(c) for c in arc_counts]
    total = len(counts)
    fin = max(0, int(_num(arc_fin)))
    ch = _num(ch_fin_in_arc)

    # Borrow downward: a negative cursor means stepping back past the start
    # of the current arc, into the end of the previous one.
    while ch < 0 and fin > 0:
        fin -= 1
        ch += counts[fin]
    if ch < 0:
        ch = 0.0

    # Carry upward while the current arc has a known width and is full.
    while fin < total:
        width = counts[fin]
        if width <= 0 or ch < width:
            break
        ch -= width
        fin += 1

    return fin, ch


def clear_chapter_columns(entry) -> None:
    """
    Blank every chapter and arc column on a volume-only novel.

    A Light Novel or a Novel is counted in volumes, so these columns carry no
    meaning for it. Nullable totals go to None; the NOT NULL counters go to 0.
    """
    entry.arc_total = None
    entry.ch_total = None
    entry.arc_fin = 0
    entry.ch_fin = 0
    entry.ch_fin_in_arc = 0


def derive_novel_progress(entry) -> None:
    """
    Recompute the derived progress columns from the entry's arc rows.

    Decision B: only arcs are authoritative. Volume rows are optional
    enrichment, so vol_fin / vol_total_original / vol_total_tw are never
    touched here. A novel with no arc rows keeps its flat ch_fin / ch_total
    pair and only has the in-arc cursor zeroed.

    The type gates all of it. A volume-only type is cleared outright and never
    derives, even when arc rows are present - the editor cannot create those,
    but a Pull from the sheet can carry them in.
    """
    if getattr(entry, "type", None) in NOVEL_VOLUME_ONLY_TYPES:
        clear_chapter_columns(entry)
        return

    arcs = sorted(
        (u for u in (entry.units or []) if u.unit_kind == "arc"),
        key=lambda u: _num(u.position),
    )
    if not arcs:
        entry.ch_fin_in_arc = 0
        return

    counts = [_num(u.ch_count) for u in arcs]
    fin, ch = normalize_arc_progress(counts, entry.arc_fin, entry.ch_fin_in_arc)

    entry.arc_fin = float(fin)
    entry.ch_fin_in_arc = float(ch)
    entry.arc_total = float(len(arcs))
    entry.ch_total = float(sum(counts))
    entry.ch_fin = float(sum(counts[:fin]) + ch)


def unit_display_key(unit_kind, position, unit_key) -> str:
    """
    The label shown for a unit. An explicit unit_key always wins; otherwise
    generate one from kind and position ("Vol 1", "Arc 2"). Display-time only
    — the generated value is never stored.
    """
    if unit_key and str(unit_key).strip():
        return str(unit_key).strip()
    prefix = NOVEL_UNIT_KEY_PREFIX.get(unit_kind, "Unit")
    pos = _num(position)
    shown = int(pos) if pos == int(pos) else pos
    return f"{prefix} {shown}"
