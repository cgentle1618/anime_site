// The six person types, shared by the admin Add / Modify / Delete pages so
// the three cannot drift apart — the same job OptionSubTabBar does for the
// System Option tab.
//
// The sub-tab filters WHICH PEOPLE ARE LISTED and preselects the type for a
// new person. It deliberately does not scope the form: a person is one row and
// may hold several types, so the person editor always shows their full
// role × scope matrix.
//
// The keys are the collapsed person-role vocabulary in
// app/utils/credit_roles.py. A seventh type added there needs a line here —
// this list is hand-maintained, and the seiyuu row below was missed for a
// while precisely because nothing fails when it is out of date.
export const PERSON_SUB_TABS = [
  { key: "director", label: "Director", icon: "fa-clapperboard" },
  { key: "producer", label: "Producer", icon: "fa-briefcase" },
  { key: "composer", label: "Music / Composer", icon: "fa-music" },
  { key: "author", label: "Author", icon: "fa-pen-nib" },
  { key: "illustrator", label: "Illustrator", icon: "fa-paintbrush" },
  // Seiyuu hold no media_credit rows - their work lives in character_casting -
  // but they are people like any other, so they get a sub-tab like any other.
  { key: "seiyuu", label: "Seiyuu 聲優", icon: "fa-microphone" },
];

export default function PersonSubTabBar({ active, onSelect }) {
  return (
    <div className="flex gap-1 border-b border-border mb-4 flex-wrap">
      {PERSON_SUB_TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onSelect(t.key)}
          className={`px-4 py-2 text-sm font-bold flex items-center gap-2 border-b-2 -mb-px transition ${
            active === t.key
              ? "border-brand text-brand"
              : "border-transparent text-text-faint hover:text-text-muted"
          }`}
        >
          <i className={`fas ${t.icon}`}></i>
          {t.label}
        </button>
      ))}
    </div>
  );
}
