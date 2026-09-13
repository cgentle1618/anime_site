// Frontend: add tab page file for PublisherAddTab.
//
// The publisher twin of StudioAddTab.jsx, and split the same way:
// PublisherFields is exported separately from the page wrapper so
// PublisherModifyTab renders the exact same inputs against an existing
// publisher's form state instead of duplicating them.
//
// Two fields the studio form has are deliberately absent — MAL ID and MAL
// Link. MAL has no record of a games publisher or a Taiwanese distributor,
// so the publisher table carries no MAL columns at all.
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import PublisherScopePills from "../../components/forms/PublisherScopePills";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import ImagePicker from "../../components/forms/ImagePicker";
import { MY_RATINGS } from "../../config/fieldOptions";
// Publisher is the third consumer of this list, after Studio and Person: all
// three carry the same four name columns and the same display_name_field
// choice, so the field list is shared rather than copied.
import { STUDIO_NAME_FIELDS } from "../../lib/naming";

export { defaultPublisher } from "../../config/formFactories";

// `ownerId` is only passed by PublisherModifyTab, where the publisher row
// already exists - see ImagePicker's own module comment on why a brand-new
// (Add tab) row has nothing to attach to yet. When it is absent (the Add
// tab), the picked image cannot be attached until the publisher is saved, so
// its id is kept as `pending_image_id` for PublisherAddTab's caller to
// attach afterward.
export function PublisherFields({ publisherForm, upf, ownerId }) {
  const hasAnyName = STUDIO_NAME_FIELDS.some(
    ({ field }) => publisherForm[field]?.trim(),
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {STUDIO_NAME_FIELDS.map(({ key, label, field }) => (
          <Field key={key} label={`Name (${label})`}>
            <input
              className={inputCls}
              value={publisherForm[field] ?? ""}
              onChange={(e) => upf(field, e.target.value)}
            />
          </Field>
        ))}
      </div>
      {!hasAnyName && (
        <p className="text-[10px] font-bold text-danger -mt-2">
          A publisher needs at least one name.
        </p>
      )}
      <Field
        label="Display Name"
        hint="Which name to show by default. Falls back through English, Chinese, Japanese, Alternative when unset."
      >
        <select
          className={selectCls}
          value={publisherForm.display_name_field ?? ""}
          onChange={(e) => upf("display_name_field", e.target.value)}
        >
          <option value="">Default (English)</option>
          {STUDIO_NAME_FIELDS.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <PublisherScopePills
        scopes={publisherForm.scopes}
        setScopes={(next) => upf("scopes", next)}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="My Rating">
          <select
            className={selectCls}
            value={publisherForm.my_rating ?? ""}
            onChange={(e) => upf("my_rating", e.target.value)}
          >
            <option value="">—</option>
            {MY_RATINGS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Logo">
          <ImagePicker
            ownerType="publisher"
            ownerId={ownerId}
            role="cover"
            value={publisherForm.logo_file}
            onChange={(key, imageId) => {
              upf("logo_file", key);
              upf("pending_image_id", ownerId ? null : imageId);
            }}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Country">
          <input
            className={inputCls}
            value={publisherForm.country ?? ""}
            onChange={(e) => upf("country", e.target.value)}
          />
        </Field>
        <Field label="Website">
          <input
            className={inputCls}
            value={publisherForm.website_url ?? ""}
            onChange={(e) => upf("website_url", e.target.value)}
            placeholder="https://..."
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReleaseDateInput
          label="Founded"
          value={publisherForm.founded_date}
          onChange={(v) => upf("founded_date", v)}
        />
        <ReleaseDateInput
          label="Defunct"
          value={publisherForm.defunct_date}
          onChange={(v) => upf("defunct_date", v)}
        />
      </div>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={2}
          value={publisherForm.remark ?? ""}
          onChange={(e) => upf("remark", e.target.value)}
        />
      </Field>
    </div>
  );
}

export default function PublisherAddTab({ publisherForm, upf }) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
      <SectionHeader icon="fa-copyright" title="Publisher" />
      <PublisherFields publisherForm={publisherForm} upf={upf} />
    </div>
  );
}
