// Frontend: layout component file for Toast.
import { useToast } from "../../hooks/useToast";

const iconMap = {
  success: "fa-check-circle text-emerald-500",
  error: "fa-times-circle text-red-500",
  warning: "fa-exclamation-triangle text-amber-500",
  info: "fa-info-circle text-brand",
};

export default function Toast() {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-5 left-5 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 bg-surface border border-border rounded-xl shadow-xl px-4 py-3 min-w-64 max-w-sm animate-slide-in"
        >
          <i
            className={`fas ${iconMap[toast.type] || iconMap.info} text-lg shrink-0`}
          ></i>
          <span className="text-sm font-medium text-text">
            {toast.message}
          </span>
        </div>
      ))}
    </div>
  );
}
