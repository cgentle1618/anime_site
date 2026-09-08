// Frontend: layout component file for Toast.
//
// A flat slip with a left rule in the state hue and a mono label naming the
// state; the message itself stays in the body face.
import { useToast } from "../../hooks/useToast";

const TONES = {
  success: { label: "Saved", rule: "border-l-success", tint: "bg-success/10" },
  error: { label: "Error", rule: "border-l-danger", tint: "bg-danger/10" },
  warning: { label: "Warning", rule: "border-l-warning", tint: "bg-warning/10" },
  info: { label: "Note", rule: "border-l-info", tint: "bg-info/10" },
};

export default function Toast() {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-5 left-5 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const tone = TONES[toast.type] || TONES.info;
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-baseline gap-3 bg-surface border border-border border-l-4 ${tone.rule} px-4 py-3 min-w-64 max-w-sm animate-slide-in`}
          >
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted px-1 py-0.5 shrink-0 ${tone.tint}`}
            >
              {tone.label}
            </span>
            <span className="text-sm text-text">{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
