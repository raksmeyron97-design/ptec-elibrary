"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { useTranslations } from "next-intl";

export type ToastKind = "success" | "warning" | "error" | "info";

type ToastItem = { id: number; kind: ToastKind; message: string };

export type ToastApi = {
  success: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Fire-and-forget feedback for save/delete outcomes anywhere in the admin
 *  panel. The provider (and its single viewport) is mounted once in the
 *  protected admin layout — sections only ever call this hook. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() requires the admin <ToastProvider> above it");
  }
  return ctx;
}

/** Errors and warnings linger longer: they may need to be read, not glanced. */
const DISMISS_MS: Record<ToastKind, number> = {
  success: 5000,
  info: 5000,
  warning: 8000,
  error: 8000,
};

const ICONS: Record<ToastKind, React.ElementType> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const STYLES: Record<ToastKind, string> = {
  success: "border-success/30 bg-white text-success",
  warning: "border-warning/30 bg-white text-warning",
  error: "border-danger/30 bg-white text-danger",
  info: "border-info/30 bg-white text-info",
};

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("adminShell.toast");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), DISMISS_MS[kind]));
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      warning: (message) => push("warning", message),
      error: (message) => push("error", message),
      info: (message) => push("info", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Always-mounted live region so screen readers announce additions. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[130] flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => {
          const Icon = ICONS[toast.kind];
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-lg ${STYLES[toast.kind]}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-sm font-medium text-text-heading">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded p-0.5 text-text-muted transition hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                aria-label={t("dismiss")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
