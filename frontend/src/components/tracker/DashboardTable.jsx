// Frontend: the dashboard's list view - one dense table per section.
//
// The card grid gives every entry a tile; this gives every entry a line. The
// section renders <DashboardTable> and each media type's own component
// renders one <EntryRow> into it, so the four types keep their own progress
// derivation (they genuinely differ - see the note on the Progress column)
// while the columns themselves are defined exactly once, here. A type that
// wrote its own <td>s would drift out of alignment with the others the first
// time a column changed.
//
// The Progress column is the one place where the types do not reconcile: an
// anime counts episodes, a manga chapters, a novel volumes or chapters
// depending on its display mode, a comic issues, a game hours. Rather than
// pretend one unit fits, every row carries its unit in the cell, so the
// column reads as five honest measurements rather than one dishonest one.
//
// There is deliberately no episode stepper here. Tracking lives in the card
// view and on the entry page; a list row that is one line tall has nowhere
// to put a control without becoming a card again.
import { Link } from "react-router-dom";

import { Chip, RatingStamp } from "../ui/primitives";

const TH =
  "font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint font-normal py-2 px-3 text-left whitespace-nowrap";
const TD = "py-2 px-3 align-middle";

export function DashboardTable({ children }) {
  return (
    // Tables are the one thing allowed to be wider than the page: on a phone
    // this scrolls sideways rather than crushing five columns into 375px.
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-border-strong">
            <th className={TH}>Title</th>
            <th className={TH}>Type</th>
            <th className={TH}>Status</th>
            <th className={`${TH} text-center`}>Rating</th>
            <th className={`${TH} text-right`}>Progress</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * One entry as a table row. Every value arrives already derived - this
 * component does no media-type reasoning of its own.
 *
 * `progress` is the unit-bearing measurement ("12/28 ep", "62h/55h"), and
 * `percent` the optional completion figure beside it. A row with neither
 * shows an em dash rather than an empty cell, so a missing total is
 * visibly missing instead of looking like a rendering fault.
 */
export function EntryRow({
  path,
  title,
  subTitle,
  type,
  status,
  rating,
  progress,
  percent,
}) {
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-surface transition-colors">
      <td className={`${TD} max-w-0 w-full`}>
        <div className="truncate font-display font-semibold text-text" title={title}>
          {path ? (
            <Link
              to={path}
              className="hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </div>
        {subTitle && (
          <div
            className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint"
            title={subTitle}
          >
            {subTitle}
          </div>
        )}
      </td>
      <td className={`${TD} font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted whitespace-nowrap`}>
        {type}
      </td>
      <td className={`${TD} whitespace-nowrap`}>
        {status ? <Chip tone="ink">{status}</Chip> : null}
      </td>
      <td className={`${TD} text-center`}>
        {rating ? (
          <RatingStamp rating={rating} size="sm" className="mx-auto" />
        ) : (
          <span className="text-text-faint">—</span>
        )}
      </td>
      <td className={`${TD} text-right font-mono text-[12px] whitespace-nowrap`}>
        <span className="text-text">{progress || "—"}</span>
        {percent ? (
          <span className="text-text-faint ml-2 w-10 inline-block">{percent}</span>
        ) : (
          <span className="text-text-faint ml-2 w-10 inline-block">—</span>
        )}
      </td>
    </tr>
  );
}
