// Frontend: dashboard board that lists announcement notes from system_configs.
import { useState } from "react";
import AnnouncementModal from "../modals/AnnouncementModal";
import { Slip } from "../ui/primitives";

export default function AnnouncementBoard({ announcements = [] }) {
  const [expanded, setExpanded] = useState(null);

  if (announcements.length === 0) {
    return (
      <div className="mt-2 border border-dashed border-border-strong px-4 py-6 text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-1">
          Announcements
        </div>
        <p className="text-sm text-text-faint">
          No announcements or notes yet.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="pt-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {announcements.map((item) => (
          <Slip
            key={item.title}
            title={<span className="truncate normal-case tracking-normal text-text">{item.title}</span>}
            actions={
              <button
                onClick={() => setExpanded(item)}
                title="View fullscreen"
                aria-label="View fullscreen"
                className="text-text-faint hover:text-brand transition border border-border px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <i className="fas fa-expand"></i>
              </button>
            }
            className="flex flex-col"
          >
            <p className="text-sm text-text whitespace-pre-wrap max-h-40 overflow-hidden">
              {item.body}
            </p>
          </Slip>
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
