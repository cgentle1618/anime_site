// Which media types a publisher is offered on.
//
// The publisher twin of ScopePicker.jsx, and the one rule that differs is the
// important one: a system option with no scopes is offered EVERYWHERE, a
// publisher with no scopes is offered NOWHERE. See PublisherScope's docstring
// in app/models/staff.py — the "nowhere" default is what makes auto-scoping on
// write purely additive, so crediting 木棉花 on a manga can only widen it.
// The hint below says so, because an empty pill row otherwise reads as
// "unrestricted".
//
// Shaped like PersonAddTab's role matrix reduced to a single row: a person
// holds several roles and each role its own scopes, so that control needs two
// axes. A publisher holds exactly one role, so the media type is the whole
// key and there is nothing to cross it with.
import { Field } from "./FormField";

// The six media types a publisher may be credited on. Mirrors
// legal_scopes("publisher") in app/utils/credit_roles.py; a seventh type added
// there must be added here. Listed rather than read from MEDIA_TYPES: that
// array holds all nine, and movie / tv-show / cartoon credit no publisher.
export const PUBLISHER_SCOPES = [
  { key: "anime", label: "Anime" },
  { key: "anime-movie", label: "Anime Movie" },
  { key: "manga", label: "Manga" },
  { key: "novel", label: "Novel" },
  { key: "comic", label: "Comic" },
  { key: "game", label: "Game" },
];

export default function PublisherScopePills({ scopes, setScopes }) {
  const held = scopes || [];

  // Rebuilt from PUBLISHER_SCOPES rather than appended to, so the posted value
  // is in a stable order regardless of the order the pills were clicked.
  const toggle = (key) =>
    setScopes(
      held.includes(key)
        ? held.filter((s) => s !== key)
        : PUBLISHER_SCOPES.filter(
            (s) => s.key === key || held.includes(s.key),
          ).map((s) => s.key),
    );

  return (
    <Field
      label="Offered On"
      hint="Which media types may credit this publisher. None selected = offered nowhere."
    >
      <div className="flex flex-wrap gap-1.5">
        {PUBLISHER_SCOPES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => toggle(s.key)}
            className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${
              held.includes(s.key)
                ? "bg-brand text-on-brand border-brand"
                : "bg-surface text-text-faint border-border hover:border-border-strong"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </Field>
  );
}
