// Frontend: dashboard board that lists announcement notes from system_configs.
import { useState } from "react";
import AnnouncementModal from "../modals/AnnouncementModal";

export default function AnnouncementBoard({ announcements = [] }) {
  const [expanded, setExpanded] = useState(null);

  if (announcements.length === 0) {
    return (
      <div className="pt-2 flex flex-col items-center justify-center py-8 px-4 bg-white/50 rounded-xl border border-gray-200 border-dashed">
        <p className="text-gray-400 font-medium italic">
          <i className="fas fa-bullhorn mr-2"></i>No Announcement &amp; Notes
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="pt-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {announcements.map((item) => (
          <div
            key={item.title}
            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col"
          >
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-gray-800 flex items-center min-w-0">
                <i className="fas fa-bullhorn text-brand mr-2 shrink-0"></i>
                <span className="truncate">{item.title}</span>
              </h3>
              <button
                onClick={() => setExpanded(item)}
                title="View fullscreen"
                className="text-gray-400 hover:text-brand transition bg-white hover:bg-brand/5 border border-gray-200 rounded-lg px-2 py-1 text-xs shrink-0 focus:outline-none"
              >
                <i className="fas fa-expand"></i>
              </button>
            </div>
            <div className="px-4 py-3">
              <p className="text-sm text-gray-800 whitespace-pre-wrap max-h-40 overflow-hidden">
                {item.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      {expanded && (
        <AnnouncementModal
          announcement={expanded}
          onClose={() => setExpanded(null)}
        />
      )}
    </>
  );
}
