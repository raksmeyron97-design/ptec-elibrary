"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/** Shared modal shell (focus trap, Escape, backdrop click) for the storage
 *  module's small form dialogs (new folder / rename / move) — the same
 *  a11y behavior as components/admin/kit/ConfirmDialog.tsx, generalized to
 *  hold an arbitrary form body instead of a fixed confirm/cancel layout. */
export default function StorageDialogShell({
  open,
  title,
  onClose,
  busy = false,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const baseId = useId();
  const headingId = `${baseId}-title`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      const target = firstFieldRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
      target?.focus();
    }, 0);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) return onClose();
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()} role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <div ref={dialogRef} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={headingId} className="text-lg font-bold text-text-heading">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-full p-1 text-text-muted hover:bg-paper hover:text-text-heading disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div ref={firstFieldRef}>{children}</div>
        <div className="mt-5 flex justify-end gap-3">{footer}</div>
      </div>
    </div>
  );
}
