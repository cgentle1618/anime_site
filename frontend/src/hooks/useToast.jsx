// Frontend: toast state and helpers for transient UI messages.
import { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((type, message) => {
    // Use a simple incrementing id so every toast can be removed independently.
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      // Auto-dismiss after a short delay so the list does not grow forever.
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, toasts }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
