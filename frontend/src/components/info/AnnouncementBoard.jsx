// Frontend: dashboard board that lists announcement notes from system_configs.
import { useState } from "react";
import AnnouncementModal from "../modals/AnnouncementModal";

export default function AnnouncementBoard({ announcements = [] }) {
  const [expanded, setExpanded] = useState(null);

  if (announcements.length === 0) {
    return (
      <div className="pt-2 flex flex-col items-center justify-center py-8 px-4 bg-surface/50 rounded-xl border border-border border-dashed">
        <p className="text-text-faint font-medium italic">
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
            className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden flex flex-col"
          >
            <div className="bg-surface-2 border-b border-border px-4 py-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-text flex items-center min-w-0">
                <i className="fas fa-bullhorn text-brand mr-2 shrink-0"></i>
                <span className="truncate">{item.title}</span>
              </h3>
              <button
                onClick={() => setExpanded(item)}
                title="View fullscreen"
                className="text-text-faint hover:text-brand transition bg-surface hover:bg-brand-soft border border-border rounded-lg px-2 py-1 text-xs shrink-0 focus:outline-none"
              >
                <i className="fas fa-expand"></i>
              </button>
            </div>
            <div className="px-4 py-3">
              <p className="text-sm text-text whitespace-pre-wrap max-h-40 overflow-hidden">
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
