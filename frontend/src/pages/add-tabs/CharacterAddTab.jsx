// Frontend: add tab page file for CharacterAddTab.
//
// A character is the Person form minus the role machinery: a character
// holds no roles (see docs/superpowers/specs/
// 2026-09-05-seiyuu-character-design.md), so there is no role x scope matrix
// and no PersonSubTabBar - that component exists to split people by role,
// and a character has nothing to split by. Structurally this mirrors
// StudioAddTab.jsx more closely than PersonAddTab.jsx for that reason.
//
// CharacterFields is exported separately from the page wrapper so the
// Modify page's character editor renders the exact same inputs against an
// existing character's form state instead of duplicating them - the same
// arrangement StudioFields/PersonFields use.
import { Field, SectionHeader, inputCls, selectCls } from "../../components/forms/FormField";
import { PERSON_NAME_FIELDS } from "../../lib/naming";

// A character carries the same four name columns and display_name_field
// choice as a person or studio - see naming.js's STUDIO_NAME_FIELDS comment.
export const CHARACTER_NAME_FIELDS = PERSON_NAME_FIELDS;

export { defaultCharacter } from "../../config/formFactories";

export function CharacterFields({ characterForm, ucf }) {
  const hasAnyName = CHARACTER_NAME_FIELDS.some(
    ({ field }) => characterForm[field]?.trim(),
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CHARACTER_NAME_FIELDS.map(({ key, label, field }) => (
          <Field key={key} label={`Name (${label})`}>
            <input
              className={inputCls}
              value={characterForm[field] ?? ""}
              onChange={(e) => ucf(field, e.target.value)}
            />
          </Field>
        ))}
      </div>
      {!hasAnyName && (
        <p className="text-[10px] font-bold text-danger -mt-2">
          A character needs at least one name.
        </p>
      )}
      <Field
        label="Display Name"
        hint="Which name to show by default. Falls back through English, Chinese, Japanese, Alternative when unset."
      >
        <select
          className={selectCls}
          value={characterForm.display_name_field ?? ""}
          onChange={(e) => ucf("display_name_field", e.target.value)}
        >
          <option value="">Default (English)</option>
          {CHARACTER_NAME_FIELDS.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <SectionHeader icon="fa-id-card" title="Profile" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Gender">
          <input
            className={inputCls}
            value={characterForm.gender ?? ""}
            onChange={(e) => ucf("gender", e.target.value)}
          />
        </Field>
        <Field label="My Rating">
          <input
            className={inputCls}
            value={characterForm.my_rating ?? ""}
            onChange={(e) => ucf("my_rating", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Photo File">
        <input
          className={inputCls}
          value={characterForm.photo_file ?? ""}
          onChange={(e) => ucf("photo_file", e.target.value)}
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={characterForm.remark ?? ""}
          onChange={(e) => ucf("remark", e.target.value)}
        />
      </Field>
    </div>
  );
}

export default function CharacterAddTab({ characterForm, ucf }) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
      <SectionHeader icon="fa-user-ninja" title="Character" />
      <CharacterFields characterForm={characterForm} ucf={ucf} />
    </div>
  );
}
