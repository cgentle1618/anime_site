// Frontend: modal component file for AnnouncementModal.
import { useEffect } from "react";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[95vw] max-w-5xl h-[90vh] flex flex-col overflow-hidden transform transition-all m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
          <h3 className="text-lg font-black text-gray-800 flex items-center min-w-0">
            <i className="fas fa-bullhorn text-brand mr-2 shrink-0"></i>
            <span className="truncate">{announcement.title}</span>
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition bg-white hover:bg-gray-100 rounded-lg p-1.5 focus:outline-none shrink-0 ml-3"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-8">
          <p className="text-base text-gray-800 whitespace-pre-wrap leading-relaxed">
            {announcement.body}
          </p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-100 transition shadow-sm focus:outline-none"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
