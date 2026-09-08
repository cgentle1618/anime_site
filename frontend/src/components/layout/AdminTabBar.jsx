// Frontend: shared two-level tab selector for the admin Add / Modify / Delete
// / Form Defaults pages.
//
// The top row picks a group (Entries / Structure); the row below shows only
// that group's tabs. Both rows wrap instead of scrolling sideways, so no
// option is ever hidden off-screen. Tabs are mono labels underlined in the
// brand hue, not pills.
import { useEffect, useRef, useState } from "react";
import { TAB_GROUPS, groupOf } from "../../config/adminTabs";

export default function AdminTabBar({
  tabs,
  activeTab,
  onSelect,
  renderBadge,
}) {
  const [activeGroup, setActiveGroup] = useState(() =>
    groupOf(tabs, activeTab),
  );

  // Keep the group row in sync when the tab is changed from outside this
  // component (or when a tab in the other group becomes active). Read `tabs`
  // through a ref so a caller rebuilding the array each render doesn't reset
  // the group the user is browsing.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  useEffect(() => {
    setActiveGroup(groupOf(tabsRef.current, activeTab));
  }, [activeTab]);

  const groups = TAB_GROUPS.filter((g) => tabs.some((t) => t.group === g.key));
  const visibleTabs = tabs.filter((t) => t.group === activeGroup);

  return (
    <div className="mb-6 space-y-2">
      {/* Group row */}
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-4">
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setActiveGroup(g.key)}
              aria-pressed={activeGroup === g.key}
              className={`font-mono text-[10px] uppercase tracking-[0.14em] py-1 transition ${
                activeGroup === g.key
                  ? "text-brand"
                  : "text-text-faint hover:text-text-muted"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab row */}
      <div className="flex flex-wrap gap-x-1 border-b border-border">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            aria-current={activeTab === t.key ? "page" : undefined}
            className={`-mb-px flex items-center gap-1.5 px-3 py-2 border-b-2 font-mono text-[11px] uppercase tracking-[0.08em] whitespace-nowrap transition ${
              activeTab === t.key
                ? "border-brand text-text"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {t.label}
            {renderBadge?.(t)}
          </button>
        ))}
      </div>
    </div>
  );
}
