// Frontend: modal component file for CreateNewEntityModal.
import { Button } from "../ui/primitives";

export default function CreateNewEntityModal({
  entityType,
  text,
  onConfirm,
  onCancel,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface border border-border shadow-xl max-w-md w-full mx-4 overflow-hidden"
      >
        <div className="px-6 py-3 border-b border-border">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Create new {entityType.toLowerCase()}
          </h3>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-text-muted">
            "<span className="font-semibold text-text">{text}</span>" does not
            match any existing {entityType.toLowerCase()}.
          </p>
          <p className="text-sm text-text-faint mt-2">
            A new {entityType.toLowerCase()} record will be created with this
            name, then the entry will be saved.
          </p>
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2 justify-end">
          <Button onClick={onCancel}>Cancel</Button>
          <Button kind="primary" onClick={onConfirm}>
            Create and proceed
          </Button>
        </div>
      </div>
    </div>
  );
}
