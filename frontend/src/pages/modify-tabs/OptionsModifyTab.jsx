import { Field, SectionHeader, inputCls } from "../../components/forms/FormField";

export default function OptionsModifyTab({
  editingItem,
  optValue,
  setOptValue,
}) {
  return (
    <>
      <SectionHeader icon="fa-cog" title="System Option" />
      <Field label="Category">
        <input
          className={inputCls + " bg-gray-50 text-gray-500"}
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
    </>
  );
}
