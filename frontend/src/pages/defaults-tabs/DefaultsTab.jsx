// One generic tab for every media type on the /defaults page.
//
// There is no per-type file here (unlike add-tabs/ and modify-tabs/) because
// the whole layout is driven by the field registry, which derives its keys from
// the form factories. Adding a field to a form makes it appear here for free.

import DefaultValueControl, {
  describeBuiltIn,
} from "../../components/forms/DefaultValueControl";
import { SectionHeader } from "../../components/forms/FormField";
import { getFieldGroups } from "../../config/formFields";

export default function DefaultsTab({
  type,
  draft,
  setFieldDefault,
  clearFieldDefault,
  toggleAutofill,
  setGroupAutofill,
  allOptions,
}) {
  const groups = getFieldGroups(type);
  const { defaults, autofill } = draft;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      {groups.map(({ group, fields }) => {
        const autofillable = fields.filter((f) => f.autofillable !== false);
        const allOn =
          autofillable.length > 0 &&
          autofillable.every((f) => autofill.includes(f.key));

        return (
          <div key={group}>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <SectionHeader icon="fa-sliders-h" title={group} />
              </div>
              {autofillable.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setGroupAutofill(
                      autofillable.map((f) => f.key),
                      !allOn,
                    )
                  }
                  className="ml-4 mt-2 text-[10px] font-bold text-gray-400 hover:text-brand whitespace-nowrap uppercase tracking-wider"
                >
                  {allOn ? "Auto-fill: none" : "Auto-fill: all"}
                </button>
              )}
            </div>

            <div className="space-y-3">
              {fields.map((field) => {
                const isOverridden = field.key in defaults;
                return (
                  <div
                    key={field.key}
                    className="grid grid-cols-1 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] gap-2 md:gap-4 md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-gray-700 truncate">
                        {field.label}
                      </div>
                      <div className="text-[10px] font-mono text-gray-300 truncate">
                        {field.key}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex-1 min-w-0">
                        <DefaultValueControl
                          field={field}
                          value={defaults[field.key]}
                          onChange={(v) => setFieldDefault(field.key, v)}
                          allOptions={allOptions}
                        />
                      </div>
                      {isOverridden && (
                        <button
                          type="button"
                          title={`Revert to built-in (${describeBuiltIn(field)})`}
                          onClick={() => clearFieldDefault(field.key)}
                          className="text-gray-300 hover:text-brand shrink-0 px-1"
                        >
                          <i className="fas fa-undo text-xs"></i>
                        </button>
                      )}
                    </div>

                    <div className="shrink-0">
                      {field.autofillable === false ? (
                        <span className="text-[10px] text-gray-300">—</span>
                      ) : (
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer">
                          <input
                            type="checkbox"
                            checked={autofill.includes(field.key)}
                            onChange={() => toggleAutofill(field.key)}
                            className="rounded accent-brand"
                          />
                          Auto-fill
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
