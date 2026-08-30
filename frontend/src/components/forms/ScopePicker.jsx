// Which media types a system option is offered in.
//
// Ruling R27: option scopes are ADMIN-MANAGED data, not something a save
// derives. replace_tags used to stamp scope=<the entry's media type> on every
// tag write, so assigning an unscoped value to one entry silently narrowed it
// to that media type everywhere else - add "Disney+" under Official Source,
// use it on one TV show, and it disappears from the Cartoon dropdown with no
// warning. The auto-scoping is gone; this control is how a scope is set and
// repaired by hand, which is why it has to exist.
//
// The media type keys are the hyphenated ones (anime-movie, tv-show) served by
// GET /api/constants, and they are shown raw rather than prettified: they are
// exactly what lands in system_option_scope.scope, and a person-role scope
// (anime / non_anime) is a DIFFERENT vocabulary that must not be confused
// with them.
import { Field } from "./FormField";

export default function ScopePicker({ scopes, setScopes, mediaTypes }) {
  const selected = new Set(scopes || []);

  function toggle(key) {
    setScopes((prev) => {
      const next = new Set(prev || []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Keep the stored order stable and matching the constants order.
      return mediaTypes.filter((t) => next.has(t));
    });
  }

  return (
    <Field
      label="Scopes"
      hint="Which media types offer this value. None selected = offered everywhere."
    >
      <div className="flex flex-wrap gap-1.5">
        {mediaTypes.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${
              selected.has(key)
                ? "bg-brand text-white border-brand"
                : "bg-surface text-text-faint border-border hover:border-border-strong"
            }`}
          >
            {key}
          </button>
        ))}
      </div>
    </Field>
  );
}
