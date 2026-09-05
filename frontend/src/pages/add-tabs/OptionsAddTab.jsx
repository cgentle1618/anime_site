// Frontend: add tab page file for OptionsAddTab.
//
// Two sub-tabs share the "System Options" nav entry: Options and Tags, two
// halves of one closed-vocabulary table split for navigation only - the form
// and the endpoint are identical. See lib/optionCategoryGroups.js for the
// split. People and Studio both used to live here as well; both are credited
// entities with their own public pages rather than closed vocabularies, and
// both moved to the Entity tab group - see PersonAddTab.jsx and
// StudioAddTab.jsx.
import { Field, SectionHeader, inputCls } from "../../components/forms/FormField";
import OptionSubTabBar from "../../components/forms/OptionSubTabBar";
import ScopePicker from "../../components/forms/ScopePicker";
import UsagePicker from "../../components/forms/UsagePicker";
import { MEDIA_TYPES } from "../../config/fieldOptions";
import { categoriesForSubTab } from "../../lib/optionCategoryGroups";

// PERSON_ROLES and MEDIA_TYPES come from GET /api/constants via
// fieldOptions.js — this file used to carry its own hand-written copy of the
// person-role list with nothing enforcing the match against
// app/utils/credit_roles.py.
//
// The labels are derived from the keys rather than listed, so a role added in
// Python needs no edit here.
function roleLabel(key) {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function OptionsForm({
  optCategory,
  setOptCategory,
  optValues,
  setOptValues,
  optionCategories,
  optScopes,
  setOptScopes,
  optUsages,
  setOptUsages,
}) {
  return (
    <div className="space-y-4">
      <Field label="Category" required>
        {/* The examples come from the sub-tab's own categories: a hard-coded
            placeholder named Comic Publisher while Tags was showing. */}
        <input
          className={inputCls}
          value={optCategory}
          onChange={(e) => setOptCategory(e.target.value)}
          placeholder={`e.g. ${optionCategories.slice(0, 3).join(", ")}...`}
          list="opt-categories"
        />
        <datalist id="opt-categories">
          {optionCategories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <div className="space-y-2">
        <label className="block text-[10px] font-bold text-text-faint uppercase tracking-wider">
          Option Values
        </label>
        {optValues.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              className={inputCls}
              value={v}
              onChange={(e) =>
                setOptValues((prev) =>
                  prev.map((x, j) => (j === i ? e.target.value : x)),
                )
              }
              placeholder={`Value ${i + 1}`}
            />
            {optValues.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setOptValues((prev) => prev.filter((_, j) => j !== i))
                }
                className="px-3 py-2 text-danger/70 hover:text-danger border border-danger/40 rounded-lg hover:bg-danger/10 transition shrink-0"
              >
                <i className="fas fa-times text-xs"></i>
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setOptValues((prev) => [...prev, ""])}
          className="text-xs font-bold text-brand hover:text-brand-hover flex items-center gap-1.5 py-1"
        >
          <i className="fas fa-plus-circle"></i> Add Another Entry
        </button>
      </div>
      <ScopePicker
        scopes={optScopes}
        setScopes={setOptScopes}
        mediaTypes={MEDIA_TYPES}
      />
      <UsagePicker usages={optUsages} setUsages={setOptUsages} />
    </div>
  );
}

export default function OptionsAddTab({
  optionsSubTab,
  setOptionsSubTab,
  optCategory,
  setOptCategory,
  optValues,
  setOptValues,
  optionCategories,
  optScopes,
  setOptScopes,
  optUsages,
  setOptUsages,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
      <SectionHeader icon="fa-cog" title="System Options" />
      <OptionSubTabBar active={optionsSubTab} onSelect={setOptionsSubTab} />
      {/* Tags and Options are the same form; only the categories the
          Category box suggests differ. */}
      {(optionsSubTab === "options" || optionsSubTab === "tags") && (
        <OptionsForm
          optCategory={optCategory}
          setOptCategory={setOptCategory}
          optValues={optValues}
          setOptValues={setOptValues}
          optionCategories={categoriesForSubTab(
            optionCategories,
            optionsSubTab,
          )}
          optScopes={optScopes}
          setOptScopes={setOptScopes}
          optUsages={optUsages}
          setOptUsages={setOptUsages}
        />
      )}
    </div>
  );
}
