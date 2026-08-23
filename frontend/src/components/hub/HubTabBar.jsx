// The tab bar shared by the Collection, Franchise and Series hubs.
//
// Two labelled groups: the first picks which of the hub's own contents the
// body shows, the second opens material that belongs to the hub as a whole.
// A group with no tabs is dropped, and the divider only appears when both
// groups survive.
import TabButton from "./TabButton";

/**
 * `groups` is [{ label, tabs, counted }] in display order. `counted` asks for
 * a count pill on each of that group's tabs, resolved through `getCount` -
 * only the contents group wants them, since "Notes" has nothing to count.
 */
export default function HubTabBar({ groups, activeTab, onSelect, getCount }) {
  const filled = groups.filter((g) => g.tabs.length > 0);

  return (
    <div className="flex items-stretch gap-3 border-b border-gray-200 overflow-x-auto">
      {filled.map((group, i) => (
        <div key={group.label} className="flex items-stretch gap-3">
          {i > 0 && (
            <div className="w-px bg-gray-200 shrink-0 my-2" aria-hidden="true" />
          )}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap pr-1">
              {group.label}
            </span>
            {group.tabs.map((tab) => (
              <TabButton
                key={tab}
                tab={tab}
                activeTab={activeTab}
                onSelect={onSelect}
                count={group.counted ? getCount(tab) : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
