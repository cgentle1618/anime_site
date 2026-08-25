// Frontend: layout component file for CollapsiblePillRow.
import { useState, useRef, useLayoutEffect } from "react";

const GAP_PX = 8; // matches the gap-2 on the row below

/**
 * A wrapping row of pills clipped to `rows` lines until the reader expands it.
 * Starts collapsed, and the toggle only appears when a line is being hidden.
 *
 * Pills have no fixed width, so unlike a grid there is no track count to read
 * back. One pill's height gives one line, and the row's full scrollHeight —
 * which still reports the whole content while clipped — says whether anything
 * is hidden.
 */
export default function CollapsiblePillRow({ children, rows = 2 }) {
  const wrapRef = useRef(null);
  const rowRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const wrap = wrapRef.current;
    if (!row || !wrap) return;
    const measure = () => {
      const pill = row.firstElementChild;
      if (!pill) return;
      const limit = pill.offsetHeight * rows + GAP_PX * (rows - 1);
      setMaxHeight(limit);
      setOverflows(row.scrollHeight > limit + 1);
    };
    measure();
    // The row is clamped while collapsed, so watch the wrapper instead — its
    // width is what changes when the pills need to re-wrap.
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  });

  const collapsed = overflows && !expanded;

  return (
    <div ref={wrapRef}>
      <div
        ref={rowRef}
        className="flex gap-2 flex-wrap"
        style={
          collapsed && maxHeight ? { maxHeight, overflow: "hidden" } : undefined
        }
      >
        {children}
      </div>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-brand transition-colors"
        >
          <i className={`fas fa-chevron-${expanded ? "up" : "down"}`}></i>
          {expanded ? "Show fewer filters" : "Show all filters"}
        </button>
      )}
    </div>
  );
}
