// Frontend: modal component file for MarkAiringModal.
const CHOICES = [
  {
    value: "Active Watching",
    label: "Active Watching",
    cls: "bg-brand text-white hover:bg-brand-hover border-brand",
  },
  {
    value: "Passive Watching",
    label: "Passive Watching",
    cls: "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100",
  },
  {
    value: null,
    label: "No Change",
    cls: "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
  },
];

export default function MarkAiringModal({
  title,
  airingStatus,
  currentStatus,
  onSelect,
  onCancel,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-amber-50 border-b border-amber-100 px-6 py-4 flex items-center gap-3">
          <i className="fas fa-bolt text-amber-500 text-xl"></i>
          <h3 className="font-black text-gray-900">Mark as {airingStatus}</h3>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-600">
            "<span className="font-bold text-gray-900">{title}</span>" will be
            set to{" "}
            <span className="font-bold text-gray-900">{airingStatus}</span>.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Watching status is currently{" "}
            <span className="font-bold">{currentStatus}</span>. Set it to:
          </p>
        </div>
        <div className="px-6 pb-5 flex flex-col gap-2">
          {CHOICES.map((choice) => (
            <button
              key={choice.label}
              onClick={() => onSelect(choice.value)}
              className={`px-4 py-2 border rounded-lg text-sm font-bold transition ${choice.cls}`}
            >
              {choice.label}
            </button>
          ))}
          <button
            onClick={onCancel}
            className="mt-1 text-xs font-bold text-gray-400 hover:text-gray-600 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
