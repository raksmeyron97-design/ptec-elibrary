"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/**
 * The modal chrome shared by the review sheet and the conflict resolver:
 * backdrop, scroll lock, Escape, and a real focus trap.
 *
 * The previous review dialog focused its close button and listened for Escape
 * but never trapped Tab, so a keyboard user tabbing past "Confirm & save"
 * landed back in the permission grid *behind* the modal — able to change the
 * very values the dialog was asking them to confirm.
 */
export default function DialogShell({
  open,
  title,
  subtitle,
  busy = false,
  onClose,
  children,
  footer,
  closeLabel,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  busy?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  closeLabel: string;
}) {
  const baseId = useId();
  const headingId = `${baseId}-title`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // `onClose` and `busy` are read through refs so the effect below can depend
  // on `open` alone. Keyed on the props themselves it re-ran on every parent
  // render — and since it focuses the close button on entry, choosing an option
  // inside the conflict dialog (a parent state change) pulled focus straight
  // back out of the control the user had just operated.
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  // Refreshed in an effect rather than during render: a ref written while
  // rendering is invisible to React's own bookkeeping, and the lint rule that
  // catches it is right. An unkeyed effect runs after every commit, which is
  // well before any keydown the handler below could receive.
  useEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => closeRef.current?.focus(), 0);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busyRef.current) {
        onCloseRef.current();
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
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="modal-backdrop-in absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={busy ? undefined : onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="modal-pop-in relative z-10 flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-divider bg-bg-surface shadow-2xl sm:max-w-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
          <div className="min-w-0">
            <h2 id={headingId} className="text-base font-semibold text-text-heading">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={closeLabel}
            className="focus-field shrink-0 rounded-lg p-1.5 text-text-muted transition hover:bg-paper hover:text-text-body disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">{children}</div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-divider px-5 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}
