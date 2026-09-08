// Frontend: the <option> list for a watching_status / reading_status <select>.
//
// Every status picker renders this instead of mapping the vocabulary itself,
// so Add, Modify and the detail-page trackers all group their options the
// same way. It renders <optgroup>/<option> only — the <select>, its value and
// its onChange stay with the caller.

import { Fragment } from "react";
import { groupStatusOptions } from "../../config/statusGroups";

export default function StatusOptions({ statuses }) {
  return groupStatusOptions(statuses).map((group) =>
    group.label ? (
      <optgroup key={group.label} label={group.label}>
        {group.statuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </optgroup>
    ) : (
      // Statuses this build has no group for still have to be selectable.
      <Fragment key="_ungrouped">
        {group.statuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Fragment>
    ),
  );
}
