// Frontend: modal component file for MarkAiringModal.
//
// The three choices are plain outlined buttons: colour would otherwise be
// naming a watching status, which the design system forbids. The first one
// is the suggested answer, so it takes the brand fill.
import { Button } from "../ui/primitives";

const CHOICES = [
  { value: "Active Watching", label: "Active watching", kind: "primary" },
  { value: "Passive Watching", label: "Passive watching", kind: "outline" },
  { value: null, label: "No change", kind: "outline" },
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface border border-border shadow-xl max-w-md w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-3 border-b border-border">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Mark as {airingStatus}
          </h3>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-text-muted">
            "<span className="font-semibold text-text">{title}</span>" will be
            set to{" "}
            <span className="font-semibold text-text">{airingStatus}</span>.
          </p>
          <p className="text-sm text-text-faint mt-2">
            Watching status is currently{" "}
            <span className="font-semibold text-text">{currentStatus}</span>.
            Set it to:
          </p>
        </div>
        <div className="px-6 pb-5 flex flex-col gap-2">
          {CHOICES.map((choice) => (
            <Button
              key={choice.label}
              kind={choice.kind}
              onClick={() => onSelect(choice.value)}
            >
              {choice.label}
            </Button>
          ))}
          <Button kind="ghost" size="sm" className="mt-1" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
