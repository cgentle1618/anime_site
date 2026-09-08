// A name that loses its middle rather than its end when it does not fit.
//
// CSS truncation always cuts the tail - "無職轉生，到了異世界就拿出真本事 第…" -
// which is where the season and part live, the one part of a long title that
// distinguishes it from its siblings. This measures the text against the width
// it actually got and drops characters from the middle instead, so both ends
// survive.
import { useCallback, useEffect, useRef, useState } from "react";

import { fitMiddle, makeMeasurer } from "../../lib/textFit";

// `className` must size the span from layout - `flex-1 min-w-0`, `w-full`, or a
// block-level display such as line-clamp's. A span left to size itself from its
// own content would shrink as the text does and re-trigger the measurement.
export default function FittedName({ name, lines = 1, className = "" }) {
  const full = String(name ?? "");
  const ref = useRef(null);
  const [fitted, setFitted] = useState(full);

  const remeasure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const font =
      style.font ||
      `${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.fontFamily}`;
    setFitted(fitMiddle(full, makeMeasurer(font), el.clientWidth, lines));
  }, [full, lines]);

  // Widths here are fluid - a sidebar column, a flex row that shares space with
  // a badge - so one measurement at mount is not enough; the observer catches
  // every later resize. Where there is no ResizeObserver, or no canvas to
  // measure with, the full name renders and the CSS truncation still applies.
  useEffect(() => {
    remeasure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(remeasure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [remeasure]);

  return (
    <span ref={ref} title={full} className={className}>
      {fitted}
    </span>
  );
}
