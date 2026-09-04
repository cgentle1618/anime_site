// Frontend: add tab page file for StudioAddTab.
//
// Studio used to live as a sub-tab of System Options (see
// OptionSubTabBar.jsx's history) alongside People. It moved into its own
// Entity tab group once it became a public entity rather than a
// system-option-adjacent form - see config/adminTabs.js.
//
// StudioFields is exported separately from the page wrapper so the Modify
// page's studio editor (task 11) can render the exact same inputs against
// an existing studio's form state instead of duplicating them.
import { Field, SectionHeader, inputCls, selectCls } from "../../components/forms/FormField";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import { STUDIO_NAME_FIELDS } from "../../lib/naming";

export function StudioFields({ studioForm, usf }) {
  const hasAnyName = STUDIO_NAME_FIELDS.some(
    ({ field }) => studioForm[field]?.trim(),
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {STUDIO_NAME_FIELDS.map(({ key, label, field }) => (
          <Field key={key} label={`Name (${label})`}>
            <input
              className={inputCls}
              value={studioForm[field] ?? ""}
              onChange={(e) => usf(field, e.target.value)}
            />
          </Field>
        ))}
      </div>
      {!hasAnyName && (
        <p className="text-[10px] font-bold text-danger -mt-2">
          A studio needs at least one name.
        </p>
      )}
      <Field
        label="Display Name"
        hint="Which name to show by default. Falls back through English, Chinese, Japanese, Alternative when unset."
      >
        <select
          className={selectCls}
          value={studioForm.display_name_field ?? ""}
          onChange={(e) => usf("display_name_field", e.target.value)}
        >
          <option value="">Default (English)</option>
          {STUDIO_NAME_FIELDS.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="My Rating">
          <input
            className={inputCls}
            value={studioForm.my_rating ?? ""}
            onChange={(e) => usf("my_rating", e.target.value)}
          />
        </Field>
        <Field label="Logo File">
          <input
            className={inputCls}
            value={studioForm.logo_file ?? ""}
            onChange={(e) => usf("logo_file", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Country">
          <input
            className={inputCls}
            value={studioForm.country ?? ""}
            onChange={(e) => usf("country", e.target.value)}
          />
        </Field>
        <Field label="Website">
          <input
            className={inputCls}
            value={studioForm.website_url ?? ""}
            onChange={(e) => usf("website_url", e.target.value)}
            placeholder="https://..."
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReleaseDateInput
          label="Founded"
          value={studioForm.founded_date}
          onChange={(v) => usf("founded_date", v)}
        />
        <ReleaseDateInput
          label="Defunct"
          value={studioForm.defunct_date}
          onChange={(v) => usf("defunct_date", v)}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="MAL ID">
          <input
            className={inputCls}
            value={studioForm.mal_id ?? ""}
            onChange={(e) => usf("mal_id", e.target.value)}
          />
        </Field>
        <Field label="MAL Link">
          <input
            className={inputCls}
            value={studioForm.mal_link ?? ""}
            onChange={(e) => usf("mal_link", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={2}
          value={studioForm.remark ?? ""}
          onChange={(e) => usf("remark", e.target.value)}
        />
      </Field>
    </div>
  );
}

export default function StudioAddTab({ studioForm, usf }) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
      <SectionHeader icon="fa-industry" title="Studio" />
      <StudioFields studioForm={studioForm} usf={usf} />
    </div>
  );
}
