"use client";

import { useEffect, useId, useRef } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Confirmation modal for destructive or consequential actions — the shared
 * replacement for `window.confirm()`. Generalized from the e-books delete
 * dialog: scroll lock, focus trap, Escape/backdrop cancel, busy state.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  hint,
  tone = "danger",
  confirmLabel,
  busyLabel,
  cancelLabel,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  /** Softer secondary line, e.g. a non-destructive alternative to suggest. */
  hint?: React.ReactNode;
  tone?: "danger" | "brand";
  confirmLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("adminShell.confirm");
  const baseId = useId();
  const headingId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => confirmRef.current?.focus(), 0);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const danger = tone === "danger";
  const ToneIcon = danger ? AlertTriangle : HelpCircle;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => !busy && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-bg-surface p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              danger ? "bg-danger/10 text-danger" : "bg-brand/10 text-brand"
            }`}
            aria-hidden="true"
          >
            <ToneIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id={headingId} className="text-lg font-bold text-text-heading">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1.5 text-sm text-text-body">
                {description}
              </p>
            )}
            {hint && <p className="mt-2 text-xs text-text-muted">{hint}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-divider px-4 py-2 text-sm font-semibold text-text-body transition hover:bg-paper disabled:opacity-50"
          >
            {cancelLabel ?? t("cancel")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
              danger ? "bg-danger hover:bg-danger/90" : "bg-brand hover:bg-brand-hover"
            }`}
          >
            {busy ? (busyLabel ?? t("working")) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
