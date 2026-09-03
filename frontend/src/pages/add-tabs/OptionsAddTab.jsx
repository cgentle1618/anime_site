// Frontend: add tab page file for OptionsAddTab.
//
// Four sub-tabs share the "System Options" nav entry: Options and Tags (two
// halves of one closed-vocabulary table, split for navigation only - the
// form and the endpoint are identical), then People and Studios (credited
// entities). See app/utils/credit_roles.py for the person-role vocabulary
// and TAG_CATEGORIES, and lib/optionCategoryGroups.js for the split.
import { Field, SectionHeader, inputCls, selectCls } from "../../components/forms/FormField";
import OptionSubTabBar from "../../components/forms/OptionSubTabBar";
import ScopePicker from "../../components/forms/ScopePicker";
import { MEDIA_TYPES, PERSON_ROLES } from "../../config/fieldOptions";
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
    </div>
  );
}

function PersonForm({ personForm, upf }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Name (Native)" required>
          <input
            className={inputCls}
            value={personForm.name_native}
            onChange={(e) => upf("name_native", e.target.value)}
            placeholder="e.g. 新海誠"
          />
        </Field>
        <Field label="Name (EN)">
          <input
            className={inputCls}
            value={personForm.name_en}
            onChange={(e) => upf("name_en", e.target.value)}
          />
        </Field>
        <Field label="Name (CN)">
          <input
            className={inputCls}
            value={personForm.name_cn}
            onChange={(e) => upf("name_cn", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Role" hint="Which dropdown this person should appear in">
          <select
            className={selectCls}
            value={personForm.role}
            onChange={(e) => upf("role", e.target.value)}
          >
            <option value="">— None —</option>
            {PERSON_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Scope" hint="Only meaningful for Director">
          <select
            className={selectCls}
            value={personForm.scope}
            onChange={(e) => upf("scope", e.target.value)}
          >
            <option value="">— Any —</option>
            <option value="anime">anime</option>
            <option value="non_anime">non_anime</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Gender">
          <input
            className={inputCls}
            value={personForm.gender}
            onChange={(e) => upf("gender", e.target.value)}
          />
        </Field>
        <Field label="My Rating">
          <input
            className={inputCls}
            value={personForm.my_rating}
            onChange={(e) => upf("my_rating", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Photo File">
        <input
          className={inputCls}
          value={personForm.photo_file}
          onChange={(e) => upf("photo_file", e.target.value)}
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={2}
          value={personForm.remark}
          onChange={(e) => upf("remark", e.target.value)}
        />
      </Field>
    </div>
  );
}

function StudioForm({ studioForm, usf }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Name (Native)" required>
          <input
            className={inputCls}
            value={studioForm.name_native}
            onChange={(e) => usf("name_native", e.target.value)}
            placeholder="e.g. ufotable"
          />
        </Field>
        <Field label="Name (EN)">
          <input
            className={inputCls}
            value={studioForm.name_en}
            onChange={(e) => usf("name_en", e.target.value)}
          />
        </Field>
        <Field label="Name (CN)">
          <input
            className={inputCls}
            value={studioForm.name_cn}
            onChange={(e) => usf("name_cn", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="My Rating">
          <input
            className={inputCls}
            value={studioForm.my_rating}
            onChange={(e) => usf("my_rating", e.target.value)}
          />
        </Field>
        <Field label="Logo File">
          <input
            className={inputCls}
            value={studioForm.logo_file}
            onChange={(e) => usf("logo_file", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={2}
          value={studioForm.remark}
          onChange={(e) => usf("remark", e.target.value)}
        />
      </Field>
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
  personForm,
  upf,
  studioForm,
  usf,
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
        />
      )}
      {optionsSubTab === "people" && (
        <PersonForm personForm={personForm} upf={upf} />
      )}
      {optionsSubTab === "studios" && (
        <StudioForm studioForm={studioForm} usf={usf} />
      )}
    </div>
  );
}
