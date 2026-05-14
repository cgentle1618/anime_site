export default function CreateNewEntityModal({
  entityType,
  text,
  onConfirm,
  onCancel,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="bg-brand/5 border-b border-brand/10 px-6 py-4 flex items-center gap-3">
          <i className="fas fa-magic text-brand text-xl"></i>
          <h3 className="font-black text-gray-900">Create New {entityType}</h3>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-600">
            "<span className="font-bold text-gray-900">{text}</span>" does not
            match any existing {entityType.toLowerCase()}.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            A new <span className="font-bold">{entityType}</span> record will be
            created with this name, then the entry will be saved.
          </p>
        </div>
        <div className="px-6 pb-5 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-bold hover:bg-brand-hover transition"
          >
            Create & Proceed
          </button>
        </div>
      </div>
    </div>
  );
}
