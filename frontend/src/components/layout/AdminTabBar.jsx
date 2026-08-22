// Frontend: shared two-level tab selector for the admin Add / Modify / Delete
// / Form Defaults pages.
//
// The top row picks a group (Entries / Structure); the row below shows only
// that group's tabs. Both rows wrap instead of scrolling sideways, so no
// option is ever hidden off-screen.
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
        <div className="flex flex-wrap gap-1">
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setActiveGroup(g.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide transition-all ${
                activeGroup === g.key
                  ? "bg-brand/10 text-brand"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <i className={`fas ${g.icon}`}></i>
              {g.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab row */}
      <div className="flex flex-wrap gap-1 bg-gray-100 rounded-xl p-1">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black whitespace-nowrap transition-all ${
              activeTab === t.key
                ? "bg-white text-brand shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <i className={`fas ${t.icon}`}></i>
            {t.label}
            {renderBadge?.(t)}
          </button>
        ))}
      </div>
    </div>
  );
}
