// Frontend: modify tab page file for OptionsModifyTab.
import { Field, SectionHeader, inputCls } from "../../components/forms/FormField";
import ScopePicker from "../../components/forms/ScopePicker";
import { MEDIA_TYPES } from "../../config/fieldOptions";

export default function OptionsModifyTab({
  editingItem,
  optValue,
  setOptValue,
  optScopes,
  setOptScopes,
}) {
  return (
    <>
      <SectionHeader icon="fa-cog" title="System Option" />
      <Field label="Category">
        <input
          className={inputCls + " bg-surface-2 text-text-faint"}
          value={editingItem.category}
          readOnly
        />
      </Field>
      <Field label="Option Value" required>
        <input
          className={inputCls}
          value={optValue}
          onChange={(e) => setOptValue(e.target.value)}
        />
      </Field>
      {/* The only place an existing value's scopes can be repaired by hand.
          Nothing derives them any more (Ruling R27). */}
      <ScopePicker
        scopes={optScopes}
        setScopes={setOptScopes}
        mediaTypes={MEDIA_TYPES}
      />
    </>
  );
}

