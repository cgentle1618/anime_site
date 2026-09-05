// Frontend: the single sources editor behind every media type's Sources
// block, replacing eight copy-pasted `source_other` blocks (see
// AnimeAddTab.jsx around line 672 for the editor this supersedes).
//
// Row shape: { kind, bucket, name, url, available }. `kind` is "access" or
// "reference"; `bucket` is "main" (vocabulary-backed, availability tristate
// meaningful only for main ACCESS rows) or "other"/"restricted" (free text,
// access-only, availability not applicable). Reference rows are always
// bucket "main" - there is no free-form reference bucket, since reference
// is a fixed vocabulary (official site, Twitter, AniList, ...).
//
// Rows are identified and spliced BY INDEX, never by name. The old editors'
// payload conversion (`Object.fromEntries` over name) silently collapsed two
// rows sharing a name; storing an array and always mapping/filtering by
// index (`j === i`, `j !== i`) means duplicate names never collide.
import { inputCls, selectCls } from "./FormField";
import { getSourceValues } from "../../lib/formatters";

function updateRow(value, index, patch) {
  return value.map((row, j) => (j === index ? { ...row, ...patch } : row));
}

function removeRow(value, index) {
  return value.filter((_, j) => j !== index);
}

function addRow(bucket, kind = "access") {
  return { kind, bucket, name: "", url: "", available: null };
}

function RowActions({ onRemove }) {
  return (
    <button
      type="button"
      aria-label="Remove source"
      className="text-danger/70 hover:text-danger px-1 shrink-0"
      onClick={onRemove}
    >
      <i className="fas fa-times" />
    </button>
  );
}

function availableToSelectValue(available) {
  if (available === true) return "true";
  if (available === false) return "false";
  return "";
}

function selectValueToAvailable(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

// Shared renderer for both vocabulary-backed groups (main access rows and
// reference rows). `showAvailability` is the only visible difference: the
// tristate is meaningful only for main access rows (a watched platform
// either currently streams it or doesn't) and not for reference rows (a
// wiki/official-site link either has a URL or it doesn't - there is no
// "unavailable" wiki page).
function VocabRows({ indices, names, showAvailability, onChange, value }) {
  return (
    <div className="space-y-2">
      {indices.map((index) => {
        const row = value[index];
        return (
          <div key={index} className="flex gap-2 items-center">
            <select
              className={selectCls}
              value={row.name}
              onChange={(e) =>
                onChange(updateRow(value, index, { name: e.target.value }))
              }
            >
              <option value="">—</option>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {showAvailability && (
              <select
                className={selectCls}
                value={availableToSelectValue(row.available)}
                onChange={(e) =>
                  onChange(
                    updateRow(value, index, {
                      available: selectValueToAvailable(e.target.value),
                    }),
                  )
                }
              >
                <option value="">—</option>
                <option value="true">Available</option>
                <option value="false">Not available</option>
              </select>
            )}
            <input
              className={inputCls}
              type="url"
              placeholder="https://... (optional)"
              value={row.url}
              onChange={(e) =>
                onChange(updateRow(value, index, { url: e.target.value }))
              }
            />
            <RowActions
              onRemove={() => onChange(removeRow(value, index))}
            />
          </div>
        );
      })}
    </div>
  );
}

function FreeTextRows({ indices, bucket, label, addLabel, onChange, value }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1">
        {label}
      </label>
      <div className="space-y-2">
        {indices.map((index) => {
          const row = value[index];
          return (
            <div key={index} className="flex gap-2 items-center">
              <input
                className={inputCls}
                placeholder="Source name"
                value={row.name}
                onChange={(e) =>
                  onChange(updateRow(value, index, { name: e.target.value }))
                }
              />
              <input
                className={inputCls}
                type="url"
                placeholder="https://... (optional)"
                value={row.url}
                onChange={(e) =>
                  onChange(updateRow(value, index, { url: e.target.value }))
                }
              />
              <RowActions
                onRemove={() => onChange(removeRow(value, index))}
              />
            </div>
          );
        })}
        <button
          type="button"
          className="text-xs text-brand hover:underline mt-1"
          onClick={() => onChange([...value, addRow(bucket)])}
        >
          + {addLabel}
        </button>
      </div>
    </div>
  );
}

export default function SourcesEditor({ value, onChange, mediaType, sources }) {
  const rows = value || [];
  const mainIndices = [];
  const referenceIndices = [];
  const otherIndices = [];
  const restrictedIndices = [];
  rows.forEach((row, i) => {
    if (row.bucket === "main" && row.kind === "reference") {
      referenceIndices.push(i);
    } else if (row.bucket === "main") {
      mainIndices.push(i);
    } else if (row.bucket === "restricted") {
      restrictedIndices.push(i);
    } else {
      otherIndices.push(i);
    }
  });

  const platforms = getSourceValues(sources, {
    kind: "option",
    category: "Platform",
    scope: mediaType,
    usage: "watch",
  });
  // No `usage` here: usage is a Platform-only concept (watch vs origin).
  // Reference Source values carry no usage tag, so filtering on one would
  // wrongly exclude every reference option.
  const referenceNames = getSourceValues(sources, {
    kind: "option",
    category: "Reference Source",
    scope: mediaType,
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1">
          Main Sources
        </label>
        <VocabRows
          indices={mainIndices}
          names={platforms}
          showAvailability
          onChange={onChange}
          value={rows}
        />
        <button
          type="button"
          className="text-xs text-brand hover:underline mt-1"
          onClick={() => onChange([...rows, addRow("main", "access")])}
        >
          + Add main source
        </button>
      </div>
      <div>
        <label className="block text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1">
          Reference Sources
        </label>
        <VocabRows
          indices={referenceIndices}
          names={referenceNames}
          showAvailability={false}
          onChange={onChange}
          value={rows}
        />
        <button
          type="button"
          className="text-xs text-brand hover:underline mt-1"
          onClick={() => onChange([...rows, addRow("main", "reference")])}
        >
          + Add reference source
        </button>
      </div>
      <FreeTextRows
        indices={otherIndices}
        bucket="other"
        label="Other Sources"
        addLabel="Add other source"
        onChange={onChange}
        value={rows}
      />
      <FreeTextRows
        indices={restrictedIndices}
        bucket="restricted"
        label="Restricted Sources"
        addLabel="Add restricted source"
        onChange={onChange}
        value={rows}
      />
    </div>
  );
}
