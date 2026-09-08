// The sub-tab bar over the System Option nav entry, shared by the admin
// Add / Modify / Delete pages so the three cannot drift apart.
//
// It used to live inside OptionsAddTab.jsx, where only the Add page could
// reach it. Studio and then Person moved out entirely into the Entity tab
// group - see adminTabs.js - once each became a public entity rather than a
// system-option-adjacent form, so all three pages now offer the same two
// sub-tabs and there is no Add-only variant left.
//
// Tags and Options are the same form over the same rows - see
// lib/optionCategoryGroups.js for which categories land on which side.

export const OPTION_SUB_TABS = [
  { key: "options", label: "Options", icon: "fa-cog" },
  { key: "tags", label: "Tags", icon: "fa-tags" },
];

export default function OptionSubTabBar({
  tabs = OPTION_SUB_TABS,
  active,
  onSelect,
}) {
  return (
    <div className="flex gap-1 border-b border-border mb-4">
      {tabs.map((t) => (
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
