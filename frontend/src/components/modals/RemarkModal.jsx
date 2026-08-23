// Frontend: modal component file for RemarkModal.
//
// A remark can run long, so the hubs that own one (Franchise, Collection) clip
// it to three rows in the hero and hand the whole thing to this modal rather
// than pushing the rest of the page down.
export default function RemarkModal({ value, isAdmin, onChange, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-black text-gray-800 flex items-center">
            <i className="fas fa-comment-dots text-brand mr-2"></i>Remark
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition bg-white hover:bg-gray-100 rounded-lg p-1.5 focus:outline-none"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="p-6">
          {isAdmin ? (
            <textarea
              value={value}
              autoFocus
              onChange={(e) => onChange(e.target.value)}
              rows={16}
              className="w-full max-h-[60vh] border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand resize-none bg-white"
            />
          ) : (
            <div className="max-h-[60vh] overflow-y-auto text-sm text-gray-700 bg-gray-50 rounded-lg border border-gray-100 px-3 py-2 whitespace-pre-wrap">
              {value}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-100 transition shadow-sm focus:outline-none"
          >
            {isAdmin ? "Save & Close" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
