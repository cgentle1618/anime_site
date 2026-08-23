// One tab in a grouping-tier hub's tab bar.
//
// A count pill only makes sense for the media tabs, so it is drawn when a
// count is passed and left off otherwise.

export default function TabButton({ tab, activeTab, onSelect, count }) {
  return (
    <button
      onClick={() => onSelect(tab)}
      className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
        activeTab === tab
          ? "border-brand text-brand"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {tab}
      {count !== undefined && (
        <span className="ml-1.5 text-xs font-bold bg-gray-100 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </button>
  );
}
