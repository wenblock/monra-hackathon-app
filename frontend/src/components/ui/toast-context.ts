import { createContext } from "react";

type ToastVariant = "error" | "info" | "success";

interface ToastInput {
  description?: string;
  durationMs?: number;
  title: string;
  variant?: ToastVariant;
}

interface ToastRecord extends ToastInput {
  id: number;
}

interface ToastContextValue {
  showToast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export type { ToastContextValue, ToastInput, ToastRecord, ToastVariant };
export { ToastContext };
