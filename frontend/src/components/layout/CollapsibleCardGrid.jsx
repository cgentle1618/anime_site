// Frontend: layout component file for CollapsibleCardGrid.
import { useState, useRef, useLayoutEffect } from "react";

const GRID_CLASS =
  "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4";

/**
 * Renders `items` in the standard tier-card grid, showing only the first
 * `rows` rows until the reader expands it. Starts collapsed, and the toggle
 * only appears when there is something hidden.
 *
 * The column count is read back from the grid's own computed template rather
 * than assumed, so the cut-off follows the responsive breakpoints.
 */
export default function CollapsibleCardGrid({ items, renderItem, rows = 2 }) {
  const gridRef = useRef(null);
  const [columns, setColumns] = useState(1);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    // The template is explicit at every breakpoint, so the track count is the
    // column count even when too few items are rendered to fill a row.
    const measure = () => {
      const tracks = getComputedStyle(el).gridTemplateColumns;
      setColumns(tracks ? tracks.split(" ").filter(Boolean).length : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const limit = columns * rows;
  const collapsible = items.length > limit;
  const visible = collapsible && !expanded ? items.slice(0, limit) : items;

  return (
    <>
      <div ref={gridRef} className={GRID_CLASS}>
        {visible.map(renderItem)}
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-500 hover:text-brand hover:border-brand/40 transition-colors"
        >
          <i className={`fas fa-chevron-${expanded ? "up" : "down"}`}></i>
          {expanded ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </>
  );
}
