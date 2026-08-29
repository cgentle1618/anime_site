// Frontend: pick the content labels an entry carries.
//
// Rendered once on Add and once on Modify rather than inside each of the
// sixteen per-type tabs, because labels are the same eight keys for every
// media type and duplicating the control sixteen times is sixteen places to
// forget.
//
// On Add the entry has no id until the create call returns, so the parent
// holds the selection in state and PUTs it afterwards - the same
// create-then-PUT order the credits control already uses.
import { useCallback, useEffect, useState } from "react";

import { fetchJson } from "../../api/client";
import { endpoints } from "../../api/endpoints";

export default function ContentLabelPicker({
  value = [],
  onChange,
  disabled,
  mediaType,
  entryId,
}) {
  const [labels, setLabels] = useState([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchJson(endpoints.contentLabels.list())
      .then((rows) => alive && setLabels(rows))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  // On Modify an entry is picked after the page has mounted, so the current
  // selection is read here rather than in each of the eight per-type effects.
  useEffect(() => {
    if (!mediaType || !entryId) return undefined;
    let alive = true;
    fetchJson(endpoints.contentLabels.forEntry(mediaType, entryId))
      .then((keys) => alive && onChange(keys))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // onChange is a setState, stable enough; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaType, entryId]);

  const toggle = useCallback(
    (key) => {
      const held = new Set(value);
      if (held.has(key)) held.delete(key);
      else held.add(key);
      onChange([...held].sort());
    },
    [value, onChange],
  );

  // Nothing defined means nothing to restrict - draw no empty box.
  if (failed || labels.length === 0) return null;

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <h4 className="text-xs font-bold text-gray-600 uppercase mb-2">
        <i className="fas fa-tags mr-1.5 text-gray-400"></i>Content Labels
      </h4>
      <div className="flex flex-wrap gap-3">
        {labels.map((row) => (
          <label
            key={row.system_id}
            className="flex items-center gap-1.5 text-sm cursor-pointer"
            title={row.description || ""}
          >
            <input
              type="checkbox"
              disabled={disabled}
              checked={value.includes(row.key)}
              onChange={() => toggle(row.key)}
            />
            {row.label}
          </label>
        ))}
      </div>
      <p className="text-[11px] text-gray-500 mt-2">
        A labelled entry is hidden from anyone whose role does not hold that
        label.
      </p>
    </div>
  );
}

// Save an entry's labels. Call after a create returns its system_id, or after
// a modify submit. Failure is reported to the caller rather than swallowed:
// the entry saved, but its visibility did not.
export async function saveEntryLabels(mediaType, entryId, labelKeys) {
  return fetchJson(endpoints.contentLabels.forEntry(mediaType, entryId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label_keys: labelKeys }),
  });
}

// Read them back when an entry is picked on the Modify page.
export async function loadEntryLabels(mediaType, entryId) {
  return fetchJson(endpoints.contentLabels.forEntry(mediaType, entryId));
}
