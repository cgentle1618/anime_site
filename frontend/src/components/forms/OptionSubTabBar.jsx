// The sub-tab bar over the System Option nav entry, shared by the admin
// Add / Modify / Delete pages so the three cannot drift apart.
//
// It used to live inside OptionsAddTab.jsx, where only the Add page could
// reach it. Add offers all four sub-tabs; Modify and Delete offer the two
// that write system_option rows, because neither page can edit a person or
// a studio (their editors exist on the Add page and the /options page only).
//
// Tags and Options are the same form over the same rows - see
// lib/optionCategoryGroups.js for which categories land on which side.

export const OPTION_SUB_TABS = [
  { key: "options", label: "Options", icon: "fa-cog" },
  { key: "tags", label: "Tags", icon: "fa-tags" },
  { key: "people", label: "People", icon: "fa-user" },
  { key: "studios", label: "Studios", icon: "fa-industry" },
];

/** Just the sub-tabs that pick a category: what Modify and Delete offer. */
export const OPTION_VALUE_SUB_TABS = OPTION_SUB_TABS.filter((t) =>
  ["options", "tags"].includes(t.key),
);

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
