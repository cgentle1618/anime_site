// A release date field. Free text rather than <input type="date"> because the
// column deliberately supports year-only and month-only precision, which a
// native date picker cannot express.
import { Field, inputCls } from "./FormField";
import { isValidReleaseDate } from "../../lib/releaseDate";

export default function ReleaseDateInput({ label, value, onChange }) {
  const invalid = !isValidReleaseDate(value);
  return (
    <Field label={label} hint="YYYY, YYYY-MM, or YYYY-MM-DD">
      <input
        className={
          invalid ? `${inputCls} border-red-400 focus:ring-red-400` : inputCls
        }
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="2024-05-17"
      />
      {invalid && (
        <p className="text-[10px] font-bold text-red-500 mt-0.5">
          Use YYYY, YYYY-MM, or YYYY-MM-DD.
        </p>
      )}
    </Field>
  );
}
