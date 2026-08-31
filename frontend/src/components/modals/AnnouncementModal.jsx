// Frontend: modal component file for AnnouncementModal.
import { useEffect } from "react";
import { Button } from "../ui/primitives";

export default function AnnouncementModal({ announcement, onClose }) {
  // Close on Escape so the fullscreen view never traps the reader.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 transition-opacity"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-modal-title"
        className="bg-surface border border-border shadow-xl w-[95vw] max-w-5xl h-[90vh] flex flex-col overflow-hidden m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-3 border-b border-border flex justify-between items-center gap-3 shrink-0">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
              Announcement
            </div>
            <h3
              id="announcement-modal-title"
              className="font-display text-xl font-semibold text-text truncate"
            >
              {announcement.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-faint hover:text-text transition px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand shrink-0"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-8">
          <p className="text-base text-text whitespace-pre-wrap leading-relaxed">
            {announcement.body}
          </p>
        </div>
        <div className="px-6 py-3 border-t border-border flex justify-end shrink-0">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
