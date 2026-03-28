import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  ToastContext,
  type ToastInput,
  type ToastRecord,
  type ToastVariant,
} from "@/components/ui/toast-context";
import { cn } from "@/lib/utils";

const toastToneClasses: Record<ToastVariant, string> = {
  error:
    "border-[color:color-mix(in_srgb,var(--danger)_28%,white)] bg-[color:color-mix(in_srgb,var(--danger)_10%,white)]",
  info: "border-primary/18 bg-background/96",
  success: "border-emerald-500/24 bg-emerald-500/10",
};

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextIdRef = useRef(1);
  const timeoutIdsRef = useRef(new Map<number, number>());

  const dismissToast = useCallback((toastId: number) => {
    const timeoutId = timeoutIdsRef.current.get(toastId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timeoutIdsRef.current.delete(toastId);
    }

    setToasts(current => current.filter(toast => toast.id !== toastId));
  }, []);

  const showToast = useCallback(
    (input: ToastInput) => {
      const toastId = nextIdRef.current++;
      const nextToast: ToastRecord = {
        ...input,
        id: toastId,
        variant: input.variant ?? "info",
      };

      setToasts(current => [...current, nextToast]);

      const timeoutId = window.setTimeout(() => {
        dismissToast(toastId);
      }, input.durationMs ?? 4000);

      timeoutIdsRef.current.set(toastId, timeoutId);
    },
    [dismissToast],
  );

  useEffect(
    () => () => {
      for (const timeoutId of timeoutIdsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }

      timeoutIdsRef.current.clear();
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      <div className="pointer-events-none fixed top-4 right-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto rounded-[calc(var(--radius)+4px)] border px-4 py-3 shadow-[0_24px_50px_-32px_rgba(18,18,18,0.35)] backdrop-blur-xl",
              toastToneClasses[toast.variant ?? "info"],
            )}
            role="status"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-foreground/80">
                <ToastIcon variant={toast.variant ?? "info"} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                onClick={() => dismissToast(toast.id)}
              >
                <span className="sr-only">Dismiss toast</span>
                <X className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "success") {
    return <CheckCircle2 className="size-5" />;
  }

  if (variant === "error") {
    return <TriangleAlert className="size-5" />;
  }

  return <Info className="size-5" />;
}

export { ToastProvider };
